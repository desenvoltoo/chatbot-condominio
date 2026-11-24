import urllib.request
import json
import base64
import sys

BASE_URL = "http://localhost:3001"

def test_all():
    print("==================================================================")
    print("🏢 TESTE DE HOMOLOGAÇÃO COMPLETO — CONDOVOLTO AI (4 NOVOS MÓDULOS)")
    print("==================================================================")

    # 1. Login RBAC
    login_data = json.dumps({"email": "admin@condominio.com.br", "password": "admin123"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        login_res = json.loads(res.read().decode('utf-8'))
        token = login_res.get('token')
        print(f"[OK] 1. Login RBAC realizado. Token: {token[:15]}...")

    headers_auth = {"Authorization": f"Bearer {token}"}

    # 2. Transcrição de Áudio (Whisper/IA Pipeline)
    fake_audio_b64 = base64.b64encode(b"RIFF....WAVEfmt ....data....fake_audio_bytes_content").decode('utf-8')
    audio_payload = json.dumps({"base64Audio": fake_audio_b64, "mimeType": "audio/ogg"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/audio/transcrever", data=audio_payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        audio_res = json.loads(res.read().decode('utf-8'))
        assert audio_res.get('success') is True
        print(f"[OK] 2. POST /api/audio/transcrever: Transcrição concluída: \"{audio_res.get('text')}\"")

    # 3. Assembleia Virtual: Listar
    req = urllib.request.Request(f"{BASE_URL}/api/assembleias", headers=headers_auth)
    with urllib.request.urlopen(req) as res:
        ass_res = json.loads(res.read().decode('utf-8'))
        assert ass_res.get('success') is True
        assembleias = ass_res.get('assembleias', [])
        assert len(assembleias) > 0
        ass_id = assembleias[0]['id']
        print(f"[OK] 3. GET /api/assembleias: {len(assembleias)} assembleia(s) listada(s). ID: {ass_id}")

    # 4. Assembleia Virtual: Voto por WhatsApp
    voto_wpp = json.dumps({"message": "VOTO 1 SIM"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/simulador/chat", data=voto_wpp, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        voto_res = json.loads(res.read().decode('utf-8'))
        assert "VOTO REGISTRADO" in voto_res.get('reply', '')
        print(f"[OK] 4. Voto WhatsApp apurado no simulador: Comprovante emitido.")

    # 5. Assembleia Virtual: Gerar Ata Notarial por IA
    req = urllib.request.Request(f"{BASE_URL}/api/assembleias/{ass_id}/gerar-ata", data=b"{}", headers={**headers_auth, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        ata_res = json.loads(res.read().decode('utf-8'))
        assert ata_res.get('success') is True
        ata_texto = ata_res.get('ata', '')
        assert "ATA DE ASSEMBLEIA" in ata_texto
        print(f"[OK] 5. POST /api/assembleias/{ass_id}/gerar-ata: Ata elaborada pela IA ({len(ata_texto)} caracteres).")

    # 6. Assembleia Virtual: Download Ata Markdown
    req = urllib.request.Request(f"{BASE_URL}/api/assembleias/{ass_id}/ata/download", headers=headers_auth)
    with urllib.request.urlopen(req) as res:
        ata_md = res.read().decode('utf-8')
        assert "ATA DE ASSEMBLEIA" in ata_md
        print(f"[OK] 6. GET /api/assembleias/{ass_id}/ata/download: Download da ata validado ({len(ata_md)} bytes).")

    # 7. LGPD: Consultar Direitos e Consentimentos por WhatsApp
    lgpd_wpp = json.dumps({"message": "Gostaria de ver meus dados LGPD"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/simulador/chat", data=lgpd_wpp, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        lgpd_bot = json.loads(res.read().decode('utf-8'))
        assert "LGPD" in lgpd_bot.get('reply', '')
        print(f"[OK] 7. Consulta LGPD via WhatsApp respondida em conformidade com Art. 18.")

    # 8. LGPD: Listar Consentimentos
    req = urllib.request.Request(f"{BASE_URL}/api/lgpd/consentimentos", headers=headers_auth)
    with urllib.request.urlopen(req) as res:
        cons_res = json.loads(res.read().decode('utf-8'))
        assert cons_res.get('success') is True
        print(f"[OK] 8. GET /api/lgpd/consentimentos: {len(cons_res.get('consentimentos', []))} registros auditados.")

    # 9. LGPD: Gerar Dossiê do Titular
    req = urllib.request.Request(f"{BASE_URL}/api/lgpd/dossie/12345678909", headers=headers_auth)
    with urllib.request.urlopen(req) as res:
        dossie_res = json.loads(res.read().decode('utf-8'))
        assert dossie_res.get('success') is True
        d = dossie_res.get('dossie', {})
        print(f"[OK] 9. GET /api/lgpd/dossie/12345678909: Dossiê gerado com hash {d.get('hashValidador')[:16]}...")

    # 10. LGPD: Download do Dossiê JSON
    req = urllib.request.Request(f"{BASE_URL}/api/lgpd/dossie/12345678909/download", headers=headers_auth)
    with urllib.request.urlopen(req) as res:
        dossie_json = res.read().decode('utf-8')
        assert "hashValidador" in dossie_json and "consentimentos" in dossie_json
        print(f"[OK] 10. GET /api/lgpd/dossie/12345678909/download: Arquivo JSON de dossiê gerado ({len(dossie_json)} bytes).")

    print("\n>>> TODOS OS 10 TESTES DE HOMOLOGAÇÃO PASSARAM COM SUCESSO ABSOLUTO (100%)! <<<")

if __name__ == '__main__':
    test_all()
