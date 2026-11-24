import urllib.request
import json
import sys

BASE_URL = "http://localhost:3001"

def test_features():
    print("=== TESTANDO NOVOS RECURSOS CONDOVOLTO ===")

    # 1. Login para autenticação
    login_data = json.dumps({"email": "admin@condominio.com.br", "password": "admin123"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        login_res = json.loads(res.read().decode('utf-8'))
        token = login_res.get('token')
        print(f"[OK] 1. Login realizado com sucesso. Token obtido: {token[:15]}...")

    headers_auth = {"Authorization": f"Bearer {token}"}

    # 2. Simulador Interativo WhatsApp
    sim_data = json.dumps({"message": "Olá, gostaria de saber sobre a cota do meu apartamento"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/simulador/chat", data=sim_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        sim_res = json.loads(res.read().decode('utf-8'))
        assert sim_res.get('success') is True
        print(f"[OK] 2. POST /api/simulador/chat respondeu com sucesso:")
        print(f"     Resposta: {sim_res.get('reply')[:80]}...")

    # 3. Reset do Simulador
    req = urllib.request.Request(f"{BASE_URL}/api/simulador/reset", data=json.dumps({}).encode('utf-8'), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        reset_res = json.loads(res.read().decode('utf-8'))
        assert reset_res.get('success') is True
        print(f"[OK] 3. POST /api/simulador/reset: {reset_res.get('message')}")

    # 4. Exportação CSV Inadimplência
    req = urllib.request.Request(f"{BASE_URL}/api/relatorios/inadimplencia/csv", headers=headers_auth)
    with urllib.request.urlopen(req) as res:
        csv_inad = res.read().decode('utf-8')
        assert 'ID Cobranca' in csv_inad
        print(f"[OK] 4. GET /api/relatorios/inadimplencia/csv retornado ({len(csv_inad)} bytes).")

    # 5. Exportação CSV CSAT
    req = urllib.request.Request(f"{BASE_URL}/api/relatorios/csat/csv", headers=headers_auth)
    with urllib.request.urlopen(req) as res:
        csv_csat = res.read().decode('utf-8')
        assert 'Nota' in csv_csat
        print(f"[OK] 5. GET /api/relatorios/csat/csv retornado ({len(csv_csat)} bytes).")

    # 6. Exportação CSV Atendimentos
    req = urllib.request.Request(f"{BASE_URL}/api/relatorios/atendimentos/csv", headers=headers_auth)
    with urllib.request.urlopen(req) as res:
        csv_atend = res.read().decode('utf-8')
        assert 'WhatsApp' in csv_atend
        print(f"[OK] 6. GET /api/relatorios/atendimentos/csv retornado ({len(csv_atend)} bytes).")

    # 7. QR Code WhatsApp (com Mock Fallback gracioso)
    req = urllib.request.Request(f"{BASE_URL}/api/whatsapp/qrcode", headers=headers_auth)
    with urllib.request.urlopen(req) as res:
        qr_res = json.loads(res.read().decode('utf-8'))
        print(f"[OK] 7. GET /api/whatsapp/qrcode: {qr_res.get('message') or qr_res.get('state')} (qrcode disponível: {bool(qr_res.get('qrcode'))})")

    # 8. Portaria Visitas
    vis_data = json.dumps({"nome": "Marcos Teste", "unidade": "Apt 101", "tipo": "visitante", "validadeAcesso": "2026-12-01"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/portaria/visitas", data=vis_data, headers={**headers_auth, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        vis_res = json.loads(res.read().decode('utf-8'))
        assert vis_res.get('success') is True
        print(f"[OK] 8. POST /api/portaria/visitas: visita registrada id={vis_res.get('visita', {}).get('id')}")

    # 9. Portaria Encomendas
    enc_data = json.dumps({"morador": "Carlos Eduardo", "unidade": "Apt 101", "transportadora": "Mercado Livre", "codigoRastreio": "BR-999888"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/portaria/encomendas", data=enc_data, headers={**headers_auth, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        enc_res = json.loads(res.read().decode('utf-8'))
        assert enc_res.get('success') is True
        print(f"[OK] 9. POST /api/portaria/encomendas: encomenda registrada id={enc_res.get('encomenda', {}).get('id')}")

    print("\n>>> TODOS OS 9 TESTES DE HOMOLOGAÇÃO PASSARAM COM 100% DE SUCESSO! <<<")

if __name__ == '__main__':
    test_features()
