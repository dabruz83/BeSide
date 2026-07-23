import { motion } from 'framer-motion';

/**
 * VehiclePreview - Componente SVG interattivo per l'anteprima veicolo
 * Mostra un veicolo con zone colorabili in tempo reale
 */
export const VehiclePreview = ({
  vehicleType = 'seg_c',
  view = 'rear', // 'front' | 'rear'
  baseColor = '#AAAAAA',
  filmColor = null,
  selectedZones = [],
  onZoneClick,
  interactive = false
}) => {
  // Determina il colore per ogni zona
  const getZoneColor = (zoneId) => {
    if (selectedZones.includes(zoneId) && filmColor) {
      return filmColor;
    }
    return baseColor;
  };

  // Stile per zone clickabili
  const zoneStyle = (zoneId) => ({
    cursor: interactive ? 'pointer' : 'default',
    transition: 'all 0.3s ease',
    filter: selectedZones.includes(zoneId) ? 'brightness(1.1)' : 'none'
  });

  // Handler click zona
  const handleZoneClick = (zoneId) => {
    if (interactive && onZoneClick) {
      onZoneClick(zoneId);
    }
  };

  // Vista posteriore 3/4 (come nell'immagine di riferimento)
  if (view === 'rear') {
    return (
      <motion.svg
        viewBox="0 0 800 500"
        className="w-full h-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <defs>
          {/* Gradient per effetto 3D */}
          <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="0.15" />
            <stop offset="50%" stopColor="white" stopOpacity="0" />
            <stop offset="100%" stopColor="black" stopOpacity="0.2" />
          </linearGradient>
          
          {/* Ombra sotto il veicolo */}
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="15" floodOpacity="0.4" />
          </filter>
          
          {/* Vetro riflettente */}
          <linearGradient id="glassGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8EC8E8" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#4A90B8" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#2A5080" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Ombra a terra */}
        <ellipse cx="400" cy="460" rx="250" ry="25" fill="rgba(0,0,0,0.3)" />

        {/* CARROZZERIA PRINCIPALE - Vista 3/4 posteriore stile hatchback */}
        <g filter="url(#shadow)">
          {/* Parte inferiore / Minigonne */}
          <motion.path
            d="M180 380 L200 400 L600 400 L620 380 L600 370 L200 370 Z"
            fill={getZoneColor('parte_inferiore')}
            style={zoneStyle('parte_inferiore')}
            onClick={() => handleZoneClick('parte_inferiore')}
            whileHover={interactive ? { scale: 1.02 } : {}}
          />
          
          {/* Fiancata destra - porte */}
          <motion.path
            d="M550 200 
               Q600 210 620 250
               L630 340 L620 370 L600 370
               L580 340 L560 280 L550 200 Z"
            fill={getZoneColor('porte_fiancate')}
            style={zoneStyle('porte_fiancate')}
            onClick={() => handleZoneClick('porte_fiancate')}
            whileHover={interactive ? { scale: 1.01 } : {}}
          />
          
          {/* Fiancata sinistra - porte */}
          <motion.path
            d="M200 250
               Q180 290 180 340
               L180 370 L200 370
               L220 340 L240 280 L250 220 L200 250 Z"
            fill={getZoneColor('porte_fiancate')}
            style={zoneStyle('porte_fiancate')}
            onClick={() => handleZoneClick('porte_fiancate')}
            whileHover={interactive ? { scale: 1.01 } : {}}
          />

          {/* Pannello posteriore centrale */}
          <motion.path
            d="M250 220 
               L240 280 L220 340 L200 370
               L600 370 L580 340 L560 280 L550 200
               L520 180 L280 180 L250 220 Z"
            fill={getZoneColor('porte_fiancate')}
            style={zoneStyle('porte_fiancate')}
            onClick={() => handleZoneClick('porte_fiancate')}
            whileHover={interactive ? { scale: 1.01 } : {}}
          />
          
          {/* Tetto */}
          <motion.path
            d="M280 180 
               L290 120 L340 90 L500 90 L540 120 L520 180
               L280 180 Z"
            fill={getZoneColor('tetto')}
            style={zoneStyle('tetto')}
            onClick={() => handleZoneClick('tetto')}
            whileHover={interactive ? { scale: 1.02 } : {}}
          />

          {/* Spoiler tetto */}
          <motion.path
            d="M300 90 L320 75 L520 75 L540 90 L500 90 L340 90 Z"
            fill={getZoneColor('tetto')}
            style={zoneStyle('tetto')}
            onClick={() => handleZoneClick('tetto')}
          />
        </g>

        {/* Overlay gradient per effetto 3D */}
        <path
          d="M250 220 L240 280 L220 340 L200 370 L600 370 L580 340 L560 280 L550 200 L520 180 L280 180 L250 220 Z"
          fill="url(#bodyGradient)"
          pointerEvents="none"
        />

        {/* VETRI */}
        <g pointerEvents="none">
          {/* Lunotto posteriore */}
          <path
            d="M295 175 L305 125 L345 100 L495 100 L530 125 L515 175 L295 175 Z"
            fill="url(#glassGradient)"
            stroke="#333"
            strokeWidth="2"
          />
          
          {/* Finestrino laterale destro */}
          <path
            d="M520 180 L545 195 L555 240 L530 240 L520 200 Z"
            fill="url(#glassGradient)"
            stroke="#333"
            strokeWidth="1.5"
          />
          
          {/* Finestrino laterale sinistro */}
          <path
            d="M275 185 L255 210 L250 250 L270 250 L285 200 Z"
            fill="url(#glassGradient)"
            stroke="#333"
            strokeWidth="1.5"
          />
        </g>

        {/* FARI POSTERIORI */}
        <motion.g
          style={zoneStyle('fari_anteriori')}
          onClick={() => handleZoneClick('fari_anteriori')}
        >
          {/* Faro posteriore destro */}
          <path
            d="M580 260 L610 265 L615 310 L580 305 Z"
            fill={selectedZones.includes('fari_anteriori') ? '#FF6B6B' : '#FF4040'}
            opacity="0.9"
          />
          <path
            d="M580 260 L610 265 L615 310 L580 305 Z"
            fill="url(#bodyGradient)"
          />
          
          {/* Faro posteriore sinistro */}
          <path
            d="M220 285 L190 290 L188 330 L218 325 Z"
            fill={selectedZones.includes('fari_anteriori') ? '#FF6B6B' : '#FF4040'}
            opacity="0.9"
          />
        </motion.g>

        {/* SPECCHIETTI */}
        <motion.g
          style={zoneStyle('specchietti')}
          onClick={() => handleZoneClick('specchietti')}
        >
          {/* Specchietto destro */}
          <ellipse
            cx="575"
            cy="195"
            rx="18"
            ry="12"
            fill={getZoneColor('specchietti')}
            transform="rotate(-15 575 195)"
          />
          
          {/* Specchietto sinistro */}
          <ellipse
            cx="235"
            cy="220"
            rx="16"
            ry="10"
            fill={getZoneColor('specchietti')}
            transform="rotate(15 235 220)"
          />
        </motion.g>

        {/* RUOTE */}
        <g>
          {/* Ruota posteriore destra */}
          <ellipse cx="530" cy="385" rx="55" ry="50" fill="#1a1a1a" />
          <ellipse cx="530" cy="385" rx="45" ry="40" fill="#2a2a2a" />
          <ellipse cx="530" cy="385" rx="30" ry="26" fill="#444" />
          <ellipse cx="530" cy="385" rx="18" ry="15" fill="#666" />
          {/* Raggi cerchione */}
          {[0, 72, 144, 216, 288].map((angle, i) => (
            <line
              key={i}
              x1="530"
              y1="385"
              x2={530 + Math.cos(angle * Math.PI / 180) * 28}
              y2={385 + Math.sin(angle * Math.PI / 180) * 24}
              stroke="#888"
              strokeWidth="4"
            />
          ))}
          
          {/* Ruota anteriore destra (parzialmente visibile) */}
          <ellipse cx="650" cy="385" rx="40" ry="45" fill="#1a1a1a" />
          <ellipse cx="650" cy="385" rx="32" ry="36" fill="#2a2a2a" />
          <ellipse cx="650" cy="385" rx="22" ry="24" fill="#444" />
          
          {/* Ruota posteriore sinistra */}
          <ellipse cx="250" cy="385" rx="50" ry="45" fill="#1a1a1a" />
          <ellipse cx="250" cy="385" rx="40" ry="36" fill="#2a2a2a" />
          <ellipse cx="250" cy="385" rx="26" ry="23" fill="#444" />
          <ellipse cx="250" cy="385" rx="15" ry="13" fill="#666" />
        </g>

        {/* DETTAGLI CROMATI */}
        <g pointerEvents="none">
          {/* Logo/Badge posteriore */}
          <ellipse cx="400" cy="300" rx="25" ry="20" fill="#C0C0C0" opacity="0.8" />
          
          {/* Maniglia portellone */}
          <rect x="380" y="340" width="40" height="8" rx="4" fill="#888" />
          
          {/* Targa */}
          <rect x="350" y="355" width="100" height="25" rx="3" fill="#FFFEF0" stroke="#333" strokeWidth="1" />
        </g>
      </motion.svg>
    );
  }

  // Vista frontale 3/4
  return (
    <motion.svg
      viewBox="0 0 800 500"
      className="w-full h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <defs>
        <linearGradient id="bodyGradientFront" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity="0.15" />
          <stop offset="50%" stopColor="white" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.2" />
        </linearGradient>
        
        <filter id="shadowFront" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="15" floodOpacity="0.4" />
        </filter>
        
        <linearGradient id="glassGradientFront" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8EC8E8" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#4A90B8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#2A5080" stopOpacity="0.5" />
        </linearGradient>
      </defs>

      {/* Ombra a terra */}
      <ellipse cx="400" cy="460" rx="250" ry="25" fill="rgba(0,0,0,0.3)" />

      <g filter="url(#shadowFront)">
        {/* Parte inferiore */}
        <motion.path
          d="M180 380 L200 400 L600 400 L620 380 L600 370 L200 370 Z"
          fill={getZoneColor('parte_inferiore')}
          style={zoneStyle('parte_inferiore')}
          onClick={() => handleZoneClick('parte_inferiore')}
          whileHover={interactive ? { scale: 1.02 } : {}}
        />

        {/* Cofano */}
        <motion.path
          d="M280 180 
             L200 250 L180 300 L180 340
             L200 370 L600 370 L620 340 L620 300
             L600 250 L520 180
             L280 180 Z"
          fill={getZoneColor('cofano')}
          style={zoneStyle('cofano')}
          onClick={() => handleZoneClick('cofano')}
          whileHover={interactive ? { scale: 1.02 } : {}}
        />

        {/* Fiancate */}
        <motion.path
          d="M180 300 L180 370 L200 370 L200 320 Z"
          fill={getZoneColor('porte_fiancate')}
          style={zoneStyle('porte_fiancate')}
          onClick={() => handleZoneClick('porte_fiancate')}
        />
        <motion.path
          d="M620 300 L620 370 L600 370 L600 320 Z"
          fill={getZoneColor('porte_fiancate')}
          style={zoneStyle('porte_fiancate')}
          onClick={() => handleZoneClick('porte_fiancate')}
        />

        {/* Tetto */}
        <motion.path
          d="M280 180 
             L290 120 L340 90 L500 90 L540 120 L520 180
             L280 180 Z"
          fill={getZoneColor('tetto')}
          style={zoneStyle('tetto')}
          onClick={() => handleZoneClick('tetto')}
          whileHover={interactive ? { scale: 1.02 } : {}}
        />
      </g>

      {/* Overlay 3D */}
      <path
        d="M280 180 L200 250 L180 300 L180 370 L600 370 L620 300 L600 250 L520 180 Z"
        fill="url(#bodyGradientFront)"
        pointerEvents="none"
      />

      {/* Parabrezza */}
      <path
        d="M290 175 L285 130 L345 95 L495 95 L535 130 L520 175 L290 175 Z"
        fill="url(#glassGradientFront)"
        stroke="#333"
        strokeWidth="2"
      />

      {/* Griglia anteriore */}
      <rect x="320" y="310" width="160" height="40" rx="8" fill="#1a1a1a" />
      <rect x="330" y="315" width="140" height="30" rx="5" fill="#2a2a2a" />

      {/* Fari anteriori */}
      <motion.g
        style={zoneStyle('fari_anteriori')}
        onClick={() => handleZoneClick('fari_anteriori')}
      >
        <ellipse cx="220" cy="290" rx="35" ry="25" fill="#FFFFEE" opacity="0.9" />
        <ellipse cx="220" cy="290" rx="20" ry="14" fill="#FFFF80" />
        <ellipse cx="580" cy="290" rx="35" ry="25" fill="#FFFFEE" opacity="0.9" />
        <ellipse cx="580" cy="290" rx="20" ry="14" fill="#FFFF80" />
      </motion.g>

      {/* Specchietti */}
      <motion.g
        style={zoneStyle('specchietti')}
        onClick={() => handleZoneClick('specchietti')}
      >
        <ellipse cx="195" cy="220" rx="16" ry="10" fill={getZoneColor('specchietti')} transform="rotate(-15 195 220)" />
        <ellipse cx="605" cy="220" rx="16" ry="10" fill={getZoneColor('specchietti')} transform="rotate(15 605 220)" />
      </motion.g>

      {/* Ruote */}
      <g>
        <ellipse cx="250" cy="385" rx="55" ry="50" fill="#1a1a1a" />
        <ellipse cx="250" cy="385" rx="45" ry="40" fill="#2a2a2a" />
        <ellipse cx="250" cy="385" rx="30" ry="26" fill="#444" />
        
        <ellipse cx="550" cy="385" rx="55" ry="50" fill="#1a1a1a" />
        <ellipse cx="550" cy="385" rx="45" ry="40" fill="#2a2a2a" />
        <ellipse cx="550" cy="385" rx="30" ry="26" fill="#444" />
      </g>

      {/* Targa */}
      <rect x="350" y="355" width="100" height="25" rx="3" fill="#FFFEF0" stroke="#333" strokeWidth="1" />
    </motion.svg>
  );
};

export default VehiclePreview;
