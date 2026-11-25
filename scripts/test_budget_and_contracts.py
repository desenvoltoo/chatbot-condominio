import urllib.request
import json
import time

BASE_URL = "http://localhost:3001/api"
TOKEN = None

def get_headers():
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    return headers

def request(method, endpoint, data=None):
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(url, method=method, headers=get_headers())
    if data is not None:
        req.data = json.dumps(data).encode("utf-8")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def run_tests():
    global TOKEN
    print("==================================================")
    print(" INICIANDO TESTES: PREVISÃO ORÇAMENTÁRIA & CONTRATOS ")
    print("==================================================")

    # 1. Health & Login
    h = request("GET", "/health")
    assert h["status"] == "online", f"Health check failed: {h}"
    
    login = request("POST", "/auth/login", {"email": "admin@condominio.com.br", "password": "admin123"})
    assert "token" in login, f"Login falhou: {login}"
    TOKEN = login["token"]
    print("✓ [1/12] Health check online e login com token JWT autenticado")

    # 2. List Previsões Orçamentárias
    p_list = request("GET", "/orcamentos/previsao")
    assert p_list["success"] is True, "Falha ao listar previsões"
    assert len(p_list["data"]) >= 2, f"Esperado ao menos 2 previsões nos seeds: {len(p_list['data'])}"
    print(f"✓ [2/12] Listar Previsões Orçamentárias: {len(p_list['data'])} encontradas")

    # 3. Get Previsão by ID
    prev_2026 = request("GET", "/orcamentos/previsao/orc_2026")
    assert prev_2026["success"] is True, "Falha ao obter orc_2026"
    assert prev_2026["data"]["anoExercicio"] == 2026
    assert len(prev_2026["data"]["itens"]) >= 5
    assert len(prev_2026["data"]["fracoes"]) >= 3
    print("✓ [3/12] Obter Previsão 2026 com Itens e Frações Ideais validado")

    # 4. Simulação de Cota com IA
    sim = request("POST", "/orcamentos/simular", {
        "anoExercicio": 2027,
        "inflacaoProjetada": 4.5,
        "fundoReservaPercentual": 10,
        "fundoObrasPercentual": 5,
        "despesaBaseAnual": 1872000,
        "totalUnidades": 240
    })
    assert sim["success"] is True, "Falha ao simular cota"
    s_data = sim["data"]
    assert s_data["anoExercicio"] == 2027
    assert s_data["cotaMediaUnitaria"] > 600
    assert len(s_data["fracoes"]) == 3
    assert "IPCA" in s_data["analiseIa"] or "inflação" in s_data["analiseIa"]
    print(f"✓ [4/12] Simulação Atuarial IA: Cota Média R$ {s_data['cotaMediaUnitaria']:.2f} ({s_data['impactoPercentualAnoAnterior']:+.1f}%)")

    # 5. Criar Nova Previsão Orçamentária
    nova_p = request("POST", "/orcamentos/previsao", {
        "anoExercicio": 2028,
        "titulo": "Planejamento Trienal 2028",
        "despesasOrcadasTotal": 2050000,
        "totalUnidades": 240,
        "fundoReservaPercentual": 10,
        "fundoObrasPercentual": 5,
        "inflacaoProjetada": 4.0,
        "parecerIa": "Cenário com eficiência energética e redução de custos operacionais."
    })
    assert nova_p["success"] is True
    assert nova_p["data"]["anoExercicio"] == 2028
    created_p_id = nova_p["data"]["id"]
    print(f"✓ [5/12] Cadastro de Nova Previsão Orçamentária ID {created_p_id} validado")

    # 6. Aprovar Previsão em AGO
    aprov = request("POST", f"/orcamentos/previsao/{created_p_id}/aprovar-ago", {
        "ataProtocolo": "ATA-AGO-2028-TEST-881"
    })
    assert aprov["success"] is True
    assert aprov["data"]["status"] == "aprovada_ago"
    assert aprov["data"]["ataProtocolo"] == "ATA-AGO-2028-TEST-881"
    print("✓ [6/12] Aprovação de Previsão em AGO com Protocolo de Ata validado")

    # 7. Listar Contratos e Laudos Regulatórios
    contr_list = request("GET", "/contratos")
    assert contr_list["success"] is True
    assert len(contr_list["data"]) >= 5, f"Esperado ao menos 5 contratos seed: {len(contr_list['data'])}"
    stats = contr_list["estatisticas"]
    assert stats["totalVigentes"] >= 3
    assert stats["totalLaudosLegais"] >= 5
    print(f"✓ [7/12] Listar Contratos & Estatísticas: {contr_list['total']} contratos monitorados")

    # 8. Obter Contrato por ID (Seguro Predial Art. 1.346 CC)
    seguro = request("GET", "/contratos/contr_seguro")
    assert seguro["success"] is True
    assert seguro["data"]["servicoCategoria"] == "seguro_predial"
    assert seguro["data"]["laudoObrigatorioPorLei"] is True
    assert "1.346" in seguro["data"]["artigoLegal"]
    print("✓ [8/12] Contrato Seguro Predial Obrigatório (Art. 1.346 CC) validado")

    # 9. Cadastrar Novo Contrato / Laudo
    novo_contr = request("POST", "/contratos", {
        "fornecedorNome": "MegaGeradores Energia Emergencial Ltda",
        "cnpj": "44.555.666/0001-77",
        "servicoCategoria": "gerador",
        "descricao": "Manutenção preventiva bimestral e teste sob carga do grupo gerador 150 kVA",
        "valorMensal": 750.00,
        "dataInicio": "2026-11-01",
        "dataVencimento": "2027-10-31",
        "renovacaoAutomatica": True,
        "contatoNome": "Carlos Henrique",
        "contatoTelefone": "11988112233",
        "contatoEmail": "geradores@megageradores.com.br",
        "laudoObrigatorioPorLei": True,
        "artigoLegal": "Norma Técnica ABNT NBR 10898 e IT-13 Bombeiros"
    })
    assert novo_contr["success"] is True
    c_id = novo_contr["data"]["id"]
    print(f"✓ [9/12] Cadastrar Novo Contrato de Gerador ID {c_id} validado")

    # 10. Renovar Contrato / Laudo
    renov = request("POST", f"/contratos/{c_id}/renovar", {
        "novaDataVencimento": "2028-10-31",
        "novoValorMensal": 790.00
    })
    assert renov["success"] is True
    assert renov["data"]["dataVencimento"] == "2028-10-31"
    assert renov["data"]["valorMensal"] == 790.00
    print("✓ [10/12] Renovação de Contrato com atualização de vigência e valor validada")

    # 11. Verificar Alertas de Vencimento de Contratos
    alertas = request("POST", "/contratos/verificar-alertas")
    assert alertas["success"] is True
    assert alertas["totalAlertas"] >= 1
    print(f"✓ [11/12] Verificação de Alertas Automáticos: {alertas['totalAlertas']} alertas identificados")

    # 12. Notificar Fornecedor no WhatsApp
    notif = request("POST", "/contratos/contr_avcb/notificar-whatsapp")
    assert notif["success"] is True
    assert "Notificação enviada com sucesso" in notif["mensagem"]
    print("✓ [12/12] Disparo de Alerta de Renovação para WhatsApp do Fornecedor validado")

    print("\n==================================================")
    print(" TODOS OS 12 TESTES DOS MÓDULOS 1 E 3 PASSARAM! 100% ")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
