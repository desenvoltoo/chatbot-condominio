import urllib.request
import json
import sys

BASE_URL = 'http://localhost:3001'

def post_json(endpoint, data, token=None):
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            **({'Authorization': f"Bearer {token}"} if token else {})
        }
    )
    with urllib.request.urlopen(req) as resp:
        return resp.getcode(), json.loads(resp.read().decode('utf-8'))

def put_json(endpoint, data=None, token=None):
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data or {}).encode('utf-8'),
        method='PUT',
        headers={
            'Content-Type': 'application/json',
            **({'Authorization': f"Bearer {token}"} if token else {})
        }
    )
    with urllib.request.urlopen(req) as resp:
        return resp.getcode(), json.loads(resp.read().decode('utf-8'))

def get_req(endpoint, token=None, expect_json=True):
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(
        url,
        headers={**({'Authorization': f"Bearer {token}"} if token else {})}
    )
    with urllib.request.urlopen(req) as resp:
        content = resp.read().decode('utf-8')
        if expect_json:
            return resp.getcode(), json.loads(content)
        return resp.getcode(), content

def run_tests():
    print("=" * 65)
    print("⚖️ CONDOVOLTO AI — SUÍTE DE TESTES: 4 NOVOS MÓDULOS ENTERPRISE")
    print("=" * 65)
    passed = 0
    total = 8

    # 1. Login
    print("\n[1/8] Autenticando Administrador Master...")
    code, data = post_json('/api/auth/login', {'email': 'admin@condominio.com.br', 'password': 'admin123'})
    assert code == 200 and 'token' in data, f"Login falhou: {data}"
    token = data['token']
    print(f"✅ Autenticação OK: Token emitido para {data.get('user', {}).get('name')}")
    passed += 1

    # 2. Ocorrências Legais: Listagem & KPIs
    print("\n[2/8] Testando Listagem de Ocorrências e KPIs...")
    code, data = get_req('/api/ocorrencias', token)
    assert code == 200 and data.get('success'), f"Falha ao listar ocorrências: {data}"
    kpis = data.get('kpis', {})
    ocorrencias = data.get('data', [])
    assert kpis.get('total', 0) >= 1, "Nenhuma ocorrência encontrada nos KPIs"
    assert len(ocorrencias) >= 1, "Lista de ocorrências vazia"
    print(f"✅ Ocorrências OK: {kpis.get('total')} registros, {kpis.get('abertas')} em análise, {kpis.get('multadas')} multadas.")
    passed += 1

    # 3. Ocorrências Legais: Cadastro, Ação e Notificação PDF com SHA-256
    print("\n[3/8] Testando Cadastro de Infração e Expedição de Notificação com SHA-256...")
    nova_oc = {
        'unidadeId': 'Apt 204',
        'moradorNome': 'Helena Peixoto',
        'moradorTelefone': '5511988887777',
        'unidadeInfratora': 'Apt 502',
        'categoria': 'barulho',
        'gravidade': 'grave',
        'descricao': 'Uso de aparelho de som e instrumentos musicais em volume excessivo às 01h20 da madrugada.'
    }
    code, resp_oc = post_json('/api/ocorrencias', nova_oc, token)
    assert code == 201 and resp_oc.get('success'), f"Falha ao registrar ocorrência: {resp_oc}"
    oc_data = resp_oc.get('ocorrencia') or resp_oc.get('data')
    oc_id = oc_data['id']
    protocolo = oc_data['protocolo']
    assert 'SISCON-OC' in protocolo, f"Protocolo inválido: {protocolo}"
    print(f"   -> Ocorrência {protocolo} criada com enquadramento: {oc_data['artigoRegimento']}")

    # Aplicação de Ação: Advertência Formal com 10 dias de defesa
    code, resp_acao = post_json(f'/api/ocorrencias/{oc_id}/acao', {
        'tipoAcao': 'advertencia_formal',
        'parecerSindico': 'Infração confirmada pelo porteiro de plantão. Notifica-se formalmente com prazo legal para defesa.',
        'prazoDefesaDias': 10
    }, token)
    assert code == 200 and resp_acao.get('success'), f"Falha ao aplicar advertência: {resp_acao}"
    acao_data = resp_acao.get('ocorrencia') or resp_acao.get('data')
    assert acao_data['status'] == 'advertida', "Status não atualizado para advertida"

    # Verificação do PDF Formal da Notificação
    code, html_pdf = get_req(f'/api/ocorrencias/{oc_id}/notificacao-pdf', token, expect_json=False)
    assert code == 200, f"Falha ao gerar PDF: {code}"
    assert 'NOTIFICAÇÃO FORMAL DE ADVERTÊNCIA CONDOMINIAL' in html_pdf, "Título formal ausente no PDF"
    assert 'SHA-256' in html_pdf, "Autenticação SHA-256 ausente no PDF"
    assert 'ampla defesa' in html_pdf, "Prazo de defesa ausente no PDF"
    print(f"✅ Notificação PDF OK: Documento oficial renderizado com SHA-256 e prazo de defesa.")
    passed += 1

    # 4. Enquetes WhatsApp: Listagem, Voto com 1-CPF-por-Unidade e Encerramento
    print("\n[4/8] Testando Módulo de Enquetes e Restrição de 1 Voto por CPF...")
    code, data_enq = get_req('/api/enquetes', token)
    assert code == 200 and data_enq.get('success'), f"Falha ao listar enquetes: {data_enq}"
    enquetes = data_enq.get('data') or data_enq.get('enquetes', [])
    assert len(enquetes) >= 1, "Nenhuma enquete encontrada"
    enquete_teste = enquetes[0]
    enquete_id = enquete_teste['id']
    opcao_id = enquete_teste['opcoes'][0]['id']

    # 4.1 Registra voto válido com CPF único por execução
    import time
    cpf_teste = f"999.{int(time.time() * 1000) % 1000000000:09d}-11"
    code, resp_voto = post_json(f'/api/enquetes/{enquete_id}/voto', {
        'opcaoId': opcao_id,
        'moradorCpf': cpf_teste,
        'unidadeId': 'Apt 101'
    }, token)
    assert code == 200 and resp_voto.get('success'), f"Falha ao votar na enquete: {resp_voto}"
    print(f"   -> Voto registrado com hash: {resp_voto.get('hashAuditoria', '')[:16]}...")

    # 4.2 Tenta votar novamente com o mesmo CPF (deve ser rejeitado)
    try:
        post_json(f'/api/enquetes/{enquete_id}/voto', {
            'opcaoId': opcao_id,
            'moradorCpf': cpf_teste,
            'unidadeId': 'Apt 101'
        }, token)
        assert False, "Permitiu voto duplicado para o mesmo CPF!"
    except urllib.error.HTTPError as err:
        assert err.code == 400, f"Código de erro inesperado: {err.code}"
        print("   -> Bloqueio antifraude verificado: Segundo voto com o mesmo CPF foi recusado!")

    print(f"✅ Enquetes WhatsApp OK: Voto computado e auditoria de 1 voto por CPF ativa.")
    passed += 1

    # 5. Portaria Express: Validação de PIN de 4 Dígitos Touch
    print("\n[5/8] Testando Portaria Express / Modo Tablet Guarita (PIN Touch)...")
    # 5.1 PIN Válido
    code, resp_pin = post_json('/api/portaria/validar-pin', {'pin': '2401'}, token)
    assert code == 200 and resp_pin.get('success'), f"Falha ao validar PIN válido: {resp_pin}"
    vis = resp_pin['data']
    assert vis['status'] in ['entrou', 'em_andamento'], f"Status do visitante não atualizado para entrada: {vis.get('status')}"
    print(f"   -> PIN 2401 validado: {vis['nomeVisitante']} liberado para a unidade {vis['unidadeDestino']}")

    # 5.2 PIN Inválido
    try:
        post_json('/api/portaria/validar-pin', {'pin': '0000'}, token)
        assert False, "Permitiu acesso com PIN inexistente!"
    except urllib.error.HTTPError as err:
        assert err.code == 404, f"Código inesperado para PIN inválido: {err.code}"
        print("   -> PIN 0000 recusado com 404 como esperado.")

    print("✅ Portaria Express OK: Validação instantânea de PIN touch funcionando.")
    passed += 1

    # 6. WhatsApp Telemetria e Monitoramento Real
    print("\n[6/8] Testando Endpoint de Telemetria e Status Real do WhatsApp...")
    code, resp_qr = get_req('/api/whatsapp/qrcode-real', token)
    assert code == 200 and resp_qr.get('success'), f"Falha no QR Code Real: {resp_qr}"
    qr_data = resp_qr['data']
    assert 'telemetry' in qr_data, "Objeto de telemetria ausente"
    tel = qr_data['telemetry']
    assert 'batteryLevel' in tel and 'deviceModel' in tel, "Campos de telemetria ausentes"
    assert 'pairingCode' in qr_data, "Código de pareamento ausente"
    print(f"✅ Telemetria WhatsApp OK: Bateria {tel['batteryLevel']}%, Latência {tel['latencyMs']}ms, Aparelho: {tel['deviceModel']}")
    passed += 1

    # 7. WhatsApp Simulator: Reclamação de Ocorrência & Voto em Enquete via Chatbot
    print("\n[7/8] Testando Bot Orchestrator (Ocorrências e Voto em Enquete via Chat)...")
    # Reset da sessão do simulador
    post_json('/api/simulador/reset', {'remoteJid': '5511977770204@s.whatsapp.net'})
    
    # 7.1 Mensagem inicial aciona menu
    code, r1 = post_json('/api/simulador/chat', {
        'remoteJid': '5511977770204@s.whatsapp.net',
        'message': 'Olá boa tarde',
        'pushName': 'Marcos Apt 204'
    })
    assert code == 200, f"Erro chat: {r1}"

    # 7.2 Solicitar enquete pelo WhatsApp
    code, r2 = post_json('/api/simulador/chat', {
        'remoteJid': '5511977770204@s.whatsapp.net',
        'message': 'enquete',
        'pushName': 'Marcos Apt 204'
    })
    assert code == 200, f"Erro chat enquete: {r2}"
    reply = r2.get('reply', '')
    assert 'ENQUETES' in reply or 'VOTAÇÃO' in reply or 'Enquete' in reply, f"Resposta não contém enquete: {reply}"
    print("   -> Bot respondeu com as opções da enquete ativa no WhatsApp.")

    # 7.3 Votar na enquete digitando 'enquete 1'
    code, r3 = post_json('/api/simulador/chat', {
        'remoteJid': '5511977770204@s.whatsapp.net',
        'message': 'enquete 1',
        'pushName': 'Marcos Apt 204'
    })
    assert code == 200, f"Erro voto chat: {r3}"
    reply_voto = r3.get('reply', '')
    assert 'Voto' in reply_voto or 'registrado' in reply_voto or 'computado' in reply_voto, f"Confirmação de voto ausente: {reply_voto}"
    print("✅ Chatbot WhatsApp OK: Morador consulta enquete e registra voto com recibo.")
    passed += 1

    # 8. Verificação do Painel HTML (public/painel.html e docs/painel.html)
    print("\n[8/8] Verificando Painel de Controle (Ocorrências, Enquetes, Portaria Express e Telemetria)...")
    code, html = get_req('/painel', expect_json=False)
    assert code == 200, "Painel não carregou"
    assert 'tab-content-ocorrencias' in html, "Aba de Ocorrências não encontrada no HTML"
    assert 'nav-ocorrencias' in html, "Botão da barra lateral de Ocorrências não encontrado"
    assert 'topBtnGuaritaExpress' in html, "Botão Portaria Express não encontrado no cabeçalho"
    assert 'modalModoGuaritaExpress' in html, "Modal da Guarita Express não encontrado"
    assert 'modalNovaOcorrencia' in html, "Modal de Nova Ocorrência não encontrado"
    assert 'modalAcaoOcorrencia' in html, "Modal de Ação Legal da Ocorrência não encontrado"
    assert 'listaEnquetesExpressContainer' in html, "Container de Enquetes não encontrado na Assembleia"
    assert 'wppBatteryLabel' in html, "Indicador de bateria da telemetria não encontrado"
    print("✅ Painel HTML OK: Todas as abas, botões touch da portaria, enquetes e modais jurídicos verificados.")
    passed += 1

    print("\n" + "=" * 65)
    print(f"🎉 SUCESSO TOTAL: {passed}/{total} TESTES EXECUTADOS E APROVADOS (100%)!")
    print("=" * 65)

if __name__ == '__main__':
    run_tests()
