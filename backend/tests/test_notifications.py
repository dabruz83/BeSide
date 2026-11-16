import pytest

import server


def test_notification_defaults_keep_existing_installer_alerts_and_disable_client_automation():
    settings = server._notification_settings({})
    assert settings["preferences"]["installer_appointment_reminder"] is True
    assert settings["preferences"]["installer_support_reply"] is True
    assert settings["preferences"]["client_quote"] is False
    assert settings["preferences"]["client_appointment_reminder"] is False


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
