const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function askQuestion(query) { return new Promise(resolve => rl.question(query, resolve)); }

const GRAPHQL_ENDPOINT = 'https://esustreinamento.mossoro.rn.gov.br/api/graphql';


class MiddlewareClient {
    constructor() {
        this.axiosInstance = axios.create();
        this.mapaDeAcessos = new Map(); // Mapa de <idDaUBS, idDaLotacao>
    }

    async login(username, password) {
        console.log("Realizando login do usuário de serviço (com 'force: true')...");
        const MUTATION = `mutation Login($input: LoginInput!) {\n  login(input: $input) {\n    success\n  }\n}\n`;
        const variables = { "input": { username, password, "force": true } };

        try {
            const response = await this.axiosInstance.post(
                GRAPHQL_ENDPOINT, 
                { operationName: 'Login', query: MUTATION, variables },
                {
                    headers: {
                        'Api-Consumer-Id': 'ESUS_WEB_CLIENT',
                        'apollographql-client-name': 'PEC Web',
                        'apollographql-client-version': '5.4.13' 
                    }
                }
            );

            if (response.data.errors) {
                console.error("Erro no login:", response.data.errors);
                return false;
            }

            const cookies = response.headers['set-cookie'];
            if (!cookies) { console.error("Falha ao obter cookies do login."); return false; }

            const cookieString = cookies.join('; ');
            const xsrf = cookieString.match(/XSRF-TOKEN=([^;]+)/);
            if (!xsrf) { console.error("Falha ao encontrar o XSRF-TOKEN no cookie."); return false; }

            this.axiosInstance.defaults.headers.common['Cookie'] = cookieString;
            this.axiosInstance.defaults.headers.common['X-XSRF-TOKEN'] = xsrf[1];
            this.axiosInstance.defaults.headers.common['apollographql-client-name'] = 'PEC Web';
            this.axiosInstance.defaults.headers.common['apollographql-client-version'] = '5.4.13';

            console.log("Login forçado realizado. Cookies armazenados.");
            
            const sessaoData = await this.callGraphQL('Sessao', `query Sessao {\n  sessao {\n    profissional {\n      acessos {\n        id\n        ... on Lotacao {\n          unidadeSaude { id, nome }\n        }\n      }\n    }\n  }\n}\n`, {});
            if (!sessaoData || !sessaoData.sessao.profissional.acessos[0]) {
                 console.error("Falha ao obter a primeira lotação do usuário."); return false;
            }
            const primeiraLotacaoId = sessaoData.sessao.profissional.acessos[0].id;
            
            const sessaoAtiva = await this.trocarContexto(primeiraLotacaoId, true);
            if (!sessaoAtiva) {
                console.error("Falha ao ativar a sessão com um acesso inicial.");
                return false;
            }

            console.log("Sessão de login totalmente ativada.");
            return true;
        } catch (error) {
            console.error("Falha grave no login:", error.message);
            if (error.response) console.error("Detalhes:", error.response.data);
            return false;
        }
    }

    async callGraphQL(operationName, query, variables) {
        try {
            const response = await this.axiosInstance.post(GRAPHQL_ENDPOINT, { operationName, query, variables });
            if (response.data.errors) {
                console.error(`\nAPI retornou um erro em [${operationName}]:`, JSON.stringify(response.data.errors, null, 2));
                return null;
            }
            return response.data.data;
        } catch (error) {
            console.error(`\n--- FALHA NA COMUNICAÇÃO [${operationName}] ---`);
            return null;
        }
    }

    async construirMapaDeAcessos() {
        console.log("Buscando todas as lotações do usuário de serviço...");
        const QUERY = `query Sessao {\n  sessao {\n    profissional {\n      acessos {\n        id\n        ... on Lotacao {\n          unidadeSaude { id, nome }\n        }\n      }\n    }\n  }\n}\n`;
        const data = await this.callGraphQL('Sessao', QUERY, {});
        if (!data) return false;

        const acessos = data.sessao.profissional.acessos;
        for (const acesso of acessos) {
            if (acesso.unidadeSaude && acesso.unidadeSaude.id) {
                this.mapaDeAcessos.set(acesso.unidadeSaude.id, acesso.id);
            }
        }
        console.log(`Mapa de acessos construído. O usuário tem permissão em ${this.mapaDeAcessos.size} UBSs.`);
        return true;
    }

    async buscarIdCidadao(cpf) {
        const QUERY = `
            query CidadaoAtendimentoSelectField($input: CidadaosComboQueryInput!, $emAtencaoDomiciliar: Boolean!, $retrieveContato: Boolean!) {
                cidadaosCombo(input: $input, atencaoDomiciliar: $emAtencaoDomiciliar) {
                    id
                    nome
                    contato @include(if: $retrieveContato) {
                        id
                    }
                }
            }
        `;
        const variables = {
            "input": { "query": cpf, "ativo": true, "obito": false, "limit": 1 },
            "emAtencaoDomiciliar": false,
            "retrieveContato": true // Esta variável agora é usada pelo @include
        };
        const data = await this.callGraphQL('CidadaoAtendimentoSelectField', QUERY, variables);
        return data ? data.cidadaosCombo[0] : null;
    }

    // Buscar UBS do cidadão pelo ID
    async buscarUbsCidadao(cidadaoId) {
        const QUERY = `query BuscaDetailCidadao($id: ID!) {\n  cidadao(id: $id) {\n    cidadaoVinculacaoEquipe {\n      unidadeSaude {\n        id\n        nome\n      }\n    }\n  }\n}\n`;
        const variables = { "id": cidadaoId };
        const data = await this.callGraphQL('BuscaDetailCidadao', QUERY, variables);
        return data && data.cidadao.cidadaoVinculacaoEquipe ? data.cidadao.cidadaoVinculacaoEquipe.unidadeSaude : null;
    }

    // Trocar a sessão
    async trocarContexto(lotacaoId, isLogin = false) {
        if (!isLogin) console.log(`Trocando contexto da sessão para a lotação ID: ${lotacaoId}...`);
        const MUTATION = `mutation SelecionarAcesso($input: SelecionarAcessoInput!) {\n  selecionarAcesso(input: $input) {\n    id\n  }\n}\n`;
        const variables = { "input": { "id": lotacaoId } };
        const data = await this.callGraphQL('SelecionarAcesso', MUTATION, variables);
        if (data && !isLogin) console.log("Contexto da sessão trocado com sucesso.");
        return !!data;
    }

    // Funções de Agendamento
    async listarProfissionaisPorUBS(idUnidadeSaude) {
        const QUERY = `query ProfissionalTable($input: ProfissionaisQueryInput!) {\n  profissionais(input: $input) {\n    content {\n      id\n      nome\n      lotacoes {\n        id\n        hasConfiguracaoAgenda\n        cbo {\n          id\n          nome\n        }\n      }\n    }\n  }\n}\n`;
        const variables = { "input": { "unidadeSaudeId": idUnidadeSaude, "pageParams": { "sort": ["nome"] }, "mostrarSemLotacaoAtiva": true } };
        const data = await this.callGraphQL('ProfissionalTable', QUERY, variables);
        if (!data) return [];
        return data.profissionais.content.filter(prof =>
            prof.lotacoes.some(lot => lot.hasConfiguracaoAgenda)
        );
    }

    async buscarHorariosLivres(idLotacao, dia) {
        const QUERY = `query HorarioAgendaSelectField($input: HorariosAgendaQueryInput!) {\n  horariosAgenda(input: $input) {\n    horario\n    isOcupado\n  }\n}\n`;
        const variables = { "input": { "lotacaoId": idLotacao, "dia": dia, "isAtencaoDomiciliar": false, "agendamentosIdsDesconsiderar": [] } };
        const data = await this.callGraphQL('HorarioAgendaSelectField', QUERY, variables);
        if (!data) return [];
        return data.horariosAgenda.filter(slot => !slot.isOcupado).map(slot => slot.horario);
    }

    async criarAgendamento(idCidadao, idLotacao, timestampHorario) {
        const MUTATION = `mutation SalvarAgendamentoConsulta($input: CriarAgendamentoConsultaInput!) {\n  salvarAgendamentoConsulta(input: $input)\n}\n`;
        const variables = { "input": { "cidadao": idCidadao, "horario": timestampHorario, "isForaUbs": false, "lotacao": idLotacao } };
        const data = await this.callGraphQL('SalvarAgendamentoConsulta', MUTATION, variables);
        return data ? data.salvarAgendamentoConsulta : null;
    }
}



async function iniciarSimulacaoAutonoma() {
    console.log("--- Simulador de Middleware Autônomo ---");

    const middleware = new MiddlewareClient();

    const username = await askQuestion("Digite o CPF do usuário de serviço: ");
    const password = await askQuestion("Digite a SENHA do usuário de serviço: ");
    const loginOk = await middleware.login(username, password);
    if (!loginOk) { console.log("Falha no login do middleware. Encerrando."); return; }

    const mapaOk = await middleware.construirMapaDeAcessos();
    if (!mapaOk) { console.log("Falha ao construir mapa de acessos. Encerrando."); return; }

    console.log("\n--- Início do Fluxo do Cidadão ---");
    const cpfCidadao = await askQuestion("PASSO A: Digite o CPF do cidadão para agendar: ");
    
    // Buscar ID do cidadão
    const cidadaoSimples = await middleware.buscarIdCidadao(cpfCidadao);
    if (!cidadaoSimples) { console.log("Cidadão não encontrado."); return; }
    console.log(`-> Cidadão encontrado: ${cidadaoSimples.nome} (ID: ${cidadaoSimples.id})`);

    // Buscar UBS do cidadão
    const ubsCidadao = await middleware.buscarUbsCidadao(cidadaoSimples.id);
    if (!ubsCidadao) { console.log("Cidadão encontrado, mas não foi possível identificar sua UBS de vínculo."); return; }
    console.log(`-> Cidadão pertence à UBS: "${ubsCidadao.nome}" (ID: ${ubsCidadao.id})\n`);

    // Verificar Permissão e Trocar Contexto
    const lotacaoParaAtuar = middleware.mapaDeAcessos.get(ubsCidadao.id);
    if (!lotacaoParaAtuar) {
        console.log(`-> ERRO DE PERMISSÃO: O usuário de serviço não tem lotação cadastrada na UBS "${ubsCidadao.nome}".`);
        return;
    }
    console.log(`PASSO E: Permissão encontrada (Lotação ID: ${lotacaoParaAtuar}). Trocando contexto...`);
    const trocaOk = await middleware.trocarContexto(lotacaoParaAtuar);
    if (!trocaOk) { console.log("Falha ao trocar o contexto da sessão."); return; }

    // Listar Profissionais
    console.log(`\nPASSO F: Buscando profissionais com agenda na UBS "${ubsCidadao.nome}"...`);
    const profissionais = await middleware.listarProfissionaisPorUBS(ubsCidadao.id);
    if (profissionais.length === 0) { console.log("Nenhum profissional com agenda configurada foi encontrado nesta UBS."); return; }

    console.log("\nProfissionais elegíveis encontrados. Escolha um:");
    profissionais.forEach((prof, index) => {
        const especialidades = prof.lotacoes
            .filter(l => l.hasConfiguracaoAgenda)
            .map(l => l.cbo.nome)
            .join(', ');
        console.log(`  ${index + 1}: ${prof.nome} (${especialidades})`);
    });
    
    const escolhaProfissionalIndex = parseInt(await askQuestion("Digite o número do profissional: "), 10) - 1;
    const profissionalEscolhido = profissionais[escolhaProfissionalIndex];

    const lotacoesDisponiveis = profissionalEscolhido.lotacoes.filter(l => l.hasConfiguracaoAgenda);
    
    let lotacaoEscolhida;
    if (lotacoesDisponiveis.length === 1) lotacaoEscolhida = lotacoesDisponiveis[0];
    else {
        console.log("\nEscolha a especialidade:");
        lotacoesDisponiveis.forEach((lot, index) => console.log(`  ${index + 1}: ${lot.cbo.nome}`));
        const escolhaLotacaoIndex = parseInt(await askQuestion("Digite o número da especialidade: "), 10) - 1;
        lotacaoEscolhida = lotacoesDisponiveis[escolhaLotacaoIndex];
    }
    const idLotacao = lotacaoEscolhida.id;
    console.log(`-> Você escolheu: ${profissionalEscolhido.nome} como ${lotacaoEscolhida.cbo.nome} (ID: ${idLotacao})\n`);

    const diaEscolhido = await askQuestion("PASSO G: Digite o dia (AAAA-MM-DD): ");
    console.log("Buscando horários livres...");
    const horariosLivres = await middleware.buscarHorariosLivres(idLotacao, diaEscolhido);
    if (horariosLivres.length === 0) { console.log("Nenhum horário livre encontrado."); return; }
    
    console.log("\nHorários livres. Escolha um:");
    horariosLivres.forEach((timestamp, index) => {
        const horaFormatada = new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' });
        console.log(`  ${index + 1}: ${horaFormatada}`);
    });
    const escolhaHorarioIndex = parseInt(await askQuestion("Digite o número do horário: "), 10) - 1;
    const timestampAgendamento = horariosLivres[escolhaHorarioIndex];
    const horarioEscolhidoFormatado = new Date(timestampAgendamento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' });
    
    console.log("\n--- Revisão do Agendamento ---");
    console.log("Cidadão:", cidadaoSimples.nome);
    console.log("Profissional:", profissionalEscolhido.nome);
    console.log("Data:", diaEscolhido);
    console.log("Horário:", horarioEscolhidoFormatado);
    const confirmacao = await askQuestion("Confirmar? (s/n): ");

    if (confirmacao.toLowerCase() !== 's') { console.log("Agendamento cancelado."); return; }

    console.log("\nEnviando para agendamento...");
    const novoAgendamentoId = await middleware.criarAgendamento(cidadaoSimples.id, idLotacao, timestampAgendamento);

    if (novoAgendamentoId) {
        console.log("\n--- AGENDAMENTO REALIZADO COM SUCESSO! ---");
        console.log(`ID: ${novoAgendamentoId}`);
    } else {
        console.log("\n--- FALHA AO REALIZAR O AGENDAMENTO ---");
    }
}

iniciarSimulacaoAutonoma().finally(() => rl.close());