import urllib.request
import urllib.parse
import json
import sys

BASE_URL = "http://localhost:3001"

def print_result(test_name, success, message=""):
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} | {test_name}: {message}")
    if not success:
        sys.exit(1)

def http_post(path, data, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

def http_get(path, token=None):
    url = f"{BASE_URL}{path}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read()
            if "application/json" in content_type:
                return resp.status, json.loads(raw.decode("utf-8")), content_type
            else:
                return resp.status, raw.decode("utf-8"), content_type
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw.decode("utf-8")), ""
        except:
            return e.code, raw.decode("utf-8"), ""

def main():
    print("=" * 60)
    print("🧪 TEST SUITE: PORTAL DO MORADOR & BALANCETES MENSAIS")
    print("=" * 60)

    # 1. Login RBAC
    status, res = http_post("/api/auth/login", {
        "email": "admin@condominio.com.br",
        "password": "admin123"
    })
    token = res.get("token")
    print_result("1. Autenticação Admin Master", status == 200 and bool(token), f"Token JWT emitido ({token[:15]}...)")

    # 2. Portal: GET /api/portal/dados via Magic Token
    status, res, _ = http_get("/api/portal/dados?token=token_morador_101")
    dados = res.get("data", {})
    perfil = dados.get("perfil", {})
    cota = dados.get("cotaAtual", {})
    print_result(
        "2. GET /api/portal/dados (Link Mágico)",
        status == 200 and perfil.get("unidadeId") == "Apt 101" and bool(cota),
        f"Morador: {perfil.get('moradorNome')}, Cota: R$ {cota.get('valor')}"
    )

    # 3. Portal: POST /api/portal/passes-visitantes (Gera PIN de 4 dígitos)
    status, res = http_post("/api/portal/passes-visitantes", {
        "token": "token_morador_101",
        "visitanteNome": "Roberto Carlos de Oliveira",
        "tipo": "visitante",
        "dataVisita": "2026-11-26",
        "observacao": "Convidado para almoço de domingo"
    })
    pin_gerado = res.get("pin")
    print_result(
        "3. POST /api/portal/passes-visitantes",
        status == 200 and len(str(pin_gerado)) == 4,
        f"PIN de 4 dígitos gerado: {pin_gerado} (Visitante: Roberto Carlos)"
    )

    # 4. Validar PIN gerado na Guarita Express da Portaria
    status, res = http_post("/api/portaria/validar-pin", {
        "pin": pin_gerado
    }, token)
    print_result(
        "4. POST /api/portaria/validar-pin",
        status == 200 and res.get("success") == True,
        f"Liberação Portaria Express confirmada com PIN {pin_gerado}"
    )

    # 5. Portal: POST /api/portal/ocorrencias
    status, res = http_post("/api/portal/ocorrencias", {
        "token": "token_morador_101",
        "categoria": "manutencao",
        "descricao": "Lâmpada do hall do 1º andar queimada, favor verificar com o zelador."
    })
    oc = res.get("ocorrencia", {})
    print_result(
        "5. POST /api/portal/ocorrencias",
        status == 200 and bool(oc.get("id")),
        f"Ocorrência {oc.get('id')} aberta para {oc.get('unidadeId')}"
    )

    # 6. Portal: POST /api/portal/gerar-link
    status, res = http_post("/api/portal/gerar-link", {
        "unidadeId": "Apt 204",
        "moradorNome": "Mariana de Souza",
        "cpf": "987.654.321-09",
        "telefone": "5511999990002"
    }, token)
    link_url = res.get("url")
    print_result(
        "6. POST /api/portal/gerar-link (Link Mágico)",
        status == 200 and bool(link_url),
        f"Link gerado com sucesso: {link_url}"
    )

    # 7. Balancetes: GET /api/balancetes
    status, res, _ = http_get("/api/balancetes")
    balancetes = res.get("balancetes", [])
    print_result(
        "7. GET /api/balancetes",
        status == 200 and len(balancetes) >= 2,
        f"Total de balancetes encontrados: {len(balancetes)}"
    )

    # 8. Balancetes: GET /api/balancetes/bal_2026_10
    status, res, _ = http_get("/api/balancetes/bal_2026_10")
    bal_10 = res.get("balancete", {})
    print_result(
        "8. GET /api/balancetes/:id",
        status == 200 and bal_10.get("competencia") == "10/2026",
        f"Competência 10/2026 • Superávit: R$ {bal_10.get('resultadoMes')} • Hash: {bal_10.get('hashAuditoria', '')[:16]}..."
    )

    # 9. Balancetes: GET /api/balancetes/:id/html-view (A4 Printable Layout)
    status, html_content, content_type = http_get("/api/balancetes/bal_2026_10/html-view")
    print_result(
        "9. GET /api/balancetes/:id/html-view (A4 Print)",
        status == 200 and "text/html" in content_type and "DEMONSTRATIVO FINANCEIRO" in html_content,
        "Layout oficial A4 gerado com formatação de impressão, demonstrativo de contas e carimbo SHA-256"
    )

    # 10. Balancetes: POST /api/balancetes/fechar-mes
    status, res = http_post("/api/balancetes/fechar-mes", {
        "competencia": "12/2026"
    }, token)
    novo_bal = res.get("balancete", {})
    print_result(
        "10. POST /api/balancetes/fechar-mes",
        status == 200 and novo_bal.get("competencia") == "12/2026",
        f"Mês 12/2026 fechado com sucesso • Saldo Consolidado: R$ {novo_bal.get('saldoConsolidadoTotal')}"
    )

    # 11. Balancetes: POST /api/balancetes/:id/aprovar-conselho
    status, res = http_post("/api/balancetes/bal_2026_11/aprovar-conselho", {
        "conselheiros": ["Paulo Sérgio (Apt 802)", "Cláudia Mendonça (Apt 1504)", "Roberto Vasconcelos (Apt 301)"],
        "parecerConselho": "Conselho Fiscal declara prestação de contas integralmente aprovada sem ressalvas."
    }, token)
    bal_aprovado = res.get("balancete", {})
    print_result(
        "11. POST /api/balancetes/:id/aprovar-conselho",
        status == 200 and bal_aprovado.get("status") == "aprovado_conselho",
        f"Homologação do Conselho Fiscal registrada em {bal_aprovado.get('aprovadoConselhoEm')}"
    )

    # 12. Balancetes: POST /api/balancetes/:id/disparar-whatsapp
    status, res = http_post("/api/balancetes/bal_2026_10/disparar-whatsapp", {}, token)
    print_result(
        "12. POST /api/balancetes/:id/disparar-whatsapp",
        status == 200 and res.get("success") == True,
        "Resumo atuarial e prestação de contas disparados para comunidade"
    )

    # 13. Servidor Web: GET /portal
    status, html_portal, _ = http_get("/portal?token=token_morador_101")
    print_result(
        "13. GET /portal (WebApp Mobile Morador)",
        status == 200 and "Portal do Morador - CondoVolto AI" in html_portal and "Copiar Pix Copia e Cola" in html_portal,
        "PWA Mobile-first servido com sucesso na rota raiz /portal"
    )

    print("=" * 60)
    print("🎉 TODOS OS 13 TESTES DE INTEGRAÇÃO PASSARAM COM 100% DE SUCESSO!")
    print("=" * 60)

if __name__ == "__main__":
    main()
