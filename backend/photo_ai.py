"""Server-side boundary for photographic wrap previews.

The adapter is deliberately disabled by default.  It validates and normalizes
requests without storing images, and exposes one provider boundary for a later
paid integration.
"""

from dataclasses import dataclass
import os
import httpx
from typing import Any, Dict, Optional


PHOTO_AI_MAX_PHOTO_BYTES = 10 * 1024 * 1024
PHOTO_AI_MAX_GRAPHIC_BYTES = 5 * 1024 * 1024
PHOTO_AI_MAX_MASK_BYTES = 10 * 1024 * 1024
PHOTO_AI_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


class PhotoAiNotConfigured(RuntimeError):
    pass


class PhotoAiValidationError(ValueError):
    pass


class PhotoAiProviderError(RuntimeError):
    pass


async def read_upload_limited(upload: Any, *, max_bytes: int, label: str) -> bytes:
    """Read an UploadFile without allowing unbounded request-body buffering."""
    chunks = []
    total = 0
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise PhotoAiValidationError(f"{label}: file troppo grande")
        chunks.append(chunk)
    return b"".join(chunks)


def _safe_asset_ref(value: str) -> bool:
    return bool(value) and len(value) <= 200 and ".." not in value and not value.startswith(("/", "\\"))


def validate_image_bytes(content: bytes, content_type: str, *, max_bytes: int, label: str) -> None:
    if content_type not in PHOTO_AI_ALLOWED_TYPES:
        raise PhotoAiValidationError(f"{label}: formato non supportato")
    if not content or len(content) > max_bytes:
        raise PhotoAiValidationError(f"{label}: dimensione non valida")
    signatures = {
        "image/jpeg": (b"\xff\xd8\xff",),
        "image/png": (b"\x89PNG\r\n\x1a\n",),
        "image/webp": (b"RIFF",),
    }
    if not any(content.startswith(signature) for signature in signatures[content_type]):
        raise PhotoAiValidationError(f"{label}: contenuto non coerente con il formato dichiarato")
    if content_type == "image/webp" and content[8:12] != b"WEBP":
        raise PhotoAiValidationError(f"{label}: file WEBP non valido")


def normalize_photo_request(configuration: Dict[str, Any], *, photo: bytes, photo_type: str,
                            graphic: Optional[bytes] = None, graphic_type: Optional[str] = None,
                            mask: Optional[bytes] = None, mask_type: Optional[str] = None) -> Dict[str, Any]:
    if not isinstance(configuration, dict):
        raise PhotoAiValidationError("Configurazione non valida")
    vehicle = str(configuration.get("vehicle") or "").strip()
    zones = configuration.get("zones")
    if not vehicle or not isinstance(zones, list) or not zones or len(zones) > 20:
        raise PhotoAiValidationError("Veicolo e almeno una zona sono obbligatori")
    normalized_zones = []
    seen = set()
    for zone in zones:
        if not isinstance(zone, dict):
            raise PhotoAiValidationError("Zona non valida")
        zone_id = str(zone.get("zoneId") or zone.get("zone_id") or "").strip()
        kind = str(zone.get("kind") or "film").strip()
        if not zone_id or zone_id in seen or len(zone_id) > 80:
            raise PhotoAiValidationError("Zone duplicate o non valide")
        if kind not in {"film", "tint", "graphic"}:
            raise PhotoAiValidationError("Tipo di zona non supportato")
        seen.add(zone_id)
        item = {"zone_id": zone_id, "kind": kind}
        if kind == "film":
            finish = str(zone.get("finish") or "").strip()
            color_id = str(zone.get("colorId") or zone.get("color_id") or "").strip()
            if not finish or not color_id:
                raise PhotoAiValidationError(f"Colore e finitura obbligatori per {zone_id}")
            item.update({"finish": finish, "color_id": color_id})
        elif kind == "tint":
            tint = str(zone.get("tint") or "").strip()
            if tint not in {"35%", "15%", "5%", "20%"}:
                raise PhotoAiValidationError(f"Gradazione non valida per {zone_id}")
            item["tint"] = tint
        elif kind == "graphic":
            if graphic is None or not graphic_type:
                raise PhotoAiValidationError("La grafica caricata è obbligatoria per la zona selezionata")
            item["graphic_name"] = str(zone.get("graphicName") or "grafica")[:200]
        normalized_zones.append(item)
    masks = configuration.get("masks", [])
    if not isinstance(masks, list) or len(masks) > 20:
        raise PhotoAiValidationError("Maschere non valide")
    normalized_masks = []
    for mask in masks:
        if not isinstance(mask, dict) or not _safe_asset_ref(str(mask.get("asset_ref") or mask.get("assetRef") or "")):
            raise PhotoAiValidationError("Riferimento maschera non valido")
        normalized_masks.append({
            "zone_id": str(mask.get("zone_id") or mask.get("zoneId") or "")[:80],
            "view": str(mask.get("view") or "front")[:20],
            "asset_ref": str(mask.get("asset_ref") or mask.get("assetRef")),
        })
    validate_image_bytes(photo, photo_type, max_bytes=PHOTO_AI_MAX_PHOTO_BYTES, label="Foto")
    if graphic is not None:
        validate_image_bytes(graphic, graphic_type or "", max_bytes=PHOTO_AI_MAX_GRAPHIC_BYTES, label="Grafica")
    if mask is not None:
        if mask_type != "image/png":
            raise PhotoAiValidationError("La maschera deve essere un PNG trasparente")
        validate_image_bytes(mask, mask_type, max_bytes=PHOTO_AI_MAX_MASK_BYTES, label="Maschera")
        if graphic is not None:
            raise PhotoAiValidationError("Maschera e markup grafico non possono essere inviati insieme")
    notes = str(configuration.get("notes") or "").strip()[:500]
    return {
        "vehicle": vehicle,
        "zones": normalized_zones,
        "masks": normalized_masks,
        "notes": notes,
        "source_image": {"content_type": photo_type, "size": len(photo)},
        "graphic": {"content_type": graphic_type, "size": len(graphic)} if graphic is not None else None,
        "mask": {"content_type": mask_type, "size": len(mask)} if mask is not None else None,
        "source_image_bytes": photo,
        "graphic_bytes": graphic,
        "mask_bytes": mask,
    }


@dataclass
class PhotoAiResult:
    status: str
    modified_image_base64: Optional[str] = None
    modified_image_content_type: Optional[str] = None


class PhotoAiAdapter:
    """OpenAI Images Edits adapter, disabled unless both flags are enabled."""

    def __init__(self) -> None:
        self.enabled = os.environ.get("PHOTO_AI_ENABLED", "false").strip().lower() == "true"
        self.live_enabled = os.environ.get("PHOTO_AI_LIVE_ENABLED", "false").strip().lower() == "true"
        self.provider = os.environ.get("PHOTO_AI_PROVIDER", "").strip().lower()
        self.api_url = os.environ.get("PHOTO_AI_API_URL", "").strip() or "https://api.openai.com/v1/images/edits"
        self.api_key = os.environ.get("PHOTO_AI_API_KEY", "").strip()
        self.model = os.environ.get("PHOTO_AI_MODEL", "gpt-image-2.5-sunburst").strip()
        self.quality = os.environ.get("PHOTO_AI_QUALITY", "medium").strip()
        self.timeout_seconds = float(os.environ.get("PHOTO_AI_TIMEOUT_SECONDS", "120"))
        try:
            self.daily_limit = max(1, min(100, int(os.environ.get("PHOTO_AI_DAILY_LIMIT", "10"))))
        except ValueError:
            self.daily_limit = 10

    @property
    def configured(self) -> bool:
        return bool(
            self.enabled and self.live_enabled and self.provider == "openai"
            and self.api_url and self.api_key
        )

    @staticmethod
    def _prompt(request: Dict[str, Any]) -> str:
        zone_lines = []
        for zone in request["zones"]:
            details = [zone["zone_id"]]
            if zone.get("finish"):
                details.append(f"finitura {zone['finish']}")
            if zone.get("color_id"):
                details.append(f"colore codice {zone['color_id']}")
            if zone.get("tint"):
                details.append(f"oscuramento {zone['tint']}")
            if zone.get("graphic_name"):
                details.append(f"grafica {zone['graphic_name']}")
            zone_lines.append(" - " + ", ".join(details))
        notes = request.get("notes") or "nessuna"
        return (
            "Modifica esclusivamente le superfici indicate nell'immagine del veicolo. "
            "Preserva veicolo, prospettiva, proporzioni, dettagli, illuminazione e sfondo originali; "
            "non alterare le parti non selezionate e non inventare maschere o zone.\n"
            f"Veicolo: {request['vehicle']}\nZone autorizzate:\n" + "\n".join(zone_lines)
            + f"\nNote: {notes}"
        )

    async def generate(self, request: Dict[str, Any]) -> PhotoAiResult:
        if not self.configured:
            raise PhotoAiNotConfigured("Servizio AI foto non configurato")
        if not request.get("mask_bytes"):
            raise PhotoAiValidationError("Maschera delle superfici obbligatoria per l'editing AI")
        files = [
            ("image[]", ("vehicle-input", request["source_image_bytes"], request["source_image"]["content_type"])),
            ("mask", ("vehicle-mask.png", request["mask_bytes"], "image/png")),
        ]
        if request.get("graphic_bytes"):
            files.append(("markup", ("vehicle-graphic", request["graphic_bytes"], request["graphic"]["content_type"])))
        data = {
            "model": self.model,
            "prompt": self._prompt(request),
            "quality": self.quality,
            "output_format": "png",
            "background": "auto",
            "n": "1",
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(self.api_url, headers=headers, data=data, files=files)
            if response.status_code >= 400:
                raise PhotoAiProviderError("Il provider AI ha rifiutato la richiesta")
            payload = response.json()
            image = (payload.get("data") or [{}])[0]
            encoded = image.get("b64_json")
            if not encoded:
                raise PhotoAiProviderError("Il provider AI non ha restituito un'immagine")
            return PhotoAiResult("ready", encoded, "image/png")
        except (httpx.TimeoutException, httpx.HTTPError, ValueError) as exc:
            raise PhotoAiProviderError("Provider AI non raggiungibile o risposta non valida") from exc


photo_ai_adapter = PhotoAiAdapter()
