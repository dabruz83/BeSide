import pytest

import server


def test_notification_defaults_keep_existing_installer_alerts_and_disable_client_automation():
    settings = server._notification_settings({})
    assert settings["preferences"]["installer_appointment_reminder"] is True
    assert settings["preferences"]["installer_support_reply"] is True
    assert settings["preferences"]["client_quote"] is False
    assert settings["preferences"]["client_appointment_reminder"] is False
    assert settings["preferences"]["postwork_thanks"] is False
    assert settings["preferences"]["postwork_check_invite"] is False


def test_post_work_models_keep_safe_defaults_and_delivery_validation():
    quote = server.JobCreate(client_name="Cliente", job_type="ppf_full", vehicle_type="suv", quote_amount=1000, hours_worked=0, materials_cost=0, is_quote=True, post_work_enabled=True)
    assert quote.post_work_days == 30
    assert server.JobDeliveryRequest().delivered is True


def test_post_work_automations_are_independent_and_support_link_is_explicit():
    assert server.NOTIFICATION_DEFAULT_PREFERENCES["postwork_thanks"] is False
    assert server.NOTIFICATION_DEFAULT_PREFERENCES["postwork_check_invite"] is False
    assert "link_assistenza" in server.NOTIFICATION_ALLOWED_VARIABLES
    assert "{link_assistenza}" in server.NOTIFICATION_DEFAULT_TEMPLATES["postwork_check_invite"]["body"]


def test_post_work_support_tokens_are_non_enumerable_and_context_uses_company_name():
    token = "random-token-value"
    assert server._post_work_support_token_hash(token) != token
    assert server._post_work_support_token_hash(token) == server._post_work_support_token_hash(token)
    rendered = server.render_notification_template(
        {"subject": "Assistenza", "body": "{azienda} {link_assistenza}"},
        {"azienda": "Officina Test", "link_assistenza": "https://app.example/post-work/opaque"},
    )
    assert "Officina Test" in rendered["body"]
    assert "opaque" in rendered["body"]


def test_notification_template_rejects_unknown_variables():
    with pytest.raises(ValueError):
        server.validate_notification_template({"subject": "Ciao {segreto}", "body": "<p>Test</p>"})

    with pytest.raises(ValueError):
        server.validate_notification_template({"subject": "Test", "body": "<script>alert(1)</script>"})


def test_notification_template_escapes_context_values():
    template = server.validate_notification_template({"subject": "Ciao {nome_cliente}", "body": "<p>{nome_cliente}</p>"})
    rendered = server.render_notification_template(template, {"nome_cliente": '<script>alert(1)</script>'})
    assert rendered["subject"] == "Ciao &lt;script&gt;alert(1)&lt;/script&gt;"
    assert rendered["body"] == "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"
