const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}


// 1. CONFIGURAÇÃO E AUTENTICAÇÃO

const GRAPHQL_ENDPOINT = 'https://esustreinamento.mossoro.rn.gov.br/api/graphql';

const COOKIE_DE_SESSAO = 'JSESSIONID=Gea3gQUz-vgdu5A0ChsvThxtdq4xZDUzlMpEYoPm; XSRF-TOKEN=e512ca87-aaab-404f-95a1-76a25b10dd41'; 
const TOKEN_XSRF = 'e512ca87-aaab-404f-95a1-76a25b10dd41'; 


const ID_LOTACAO_USUARIO_LOGADO = "1127";

async function callGraphQL(operationName, query, variables) {
    try {
        const response = await axios.post(
            GRAPHQL_ENDPOINT,
            { operationName, query, variables },
            { headers: { 'Content-Type': 'application/json', 'Cookie': COOKIE_DE_SESSAO, 'X-XSRF-TOKEN': TOKEN_XSRF } }
        );
        if (response.data.errors) {
            console.error("\nA API retornou um erro:", JSON.stringify(response.data.errors, null, 2));
            return null;
        }
        return response.data.data;
    } catch (error) {
        console.error("\n--- FALHA NA COMUNICAÇÃO ---");
        return null;
    }
}


// 2. FUNÇÕES

async function buscarCidadao(queryDeBusca) {
    const QUERY = `
        query CidadaoAtendimentoSelectField($input: CidadaosComboQueryInput!, $emAtencaoDomiciliar: Boolean!, $retrieveContato: Boolean!) {
            cidadaosCombo(input: $input, atencaoDomiciliar: $emAtencaoDomiciliar) {
                id
                nome
                cpf
                cns
                contato @include(if: $retrieveContato) {
                    id
                    telefoneCelular
                }
            }
        }
    `;
    const variables = {
        "input": { "query": queryDeBusca, "ativo": true, "obito": false, "limit": 1 },
        "emAtencaoDomiciliar": false,
        "retrieveContato": true 
    };
    const data = await callGraphQL('CidadaoAtendimentoSelectField', QUERY, variables);
    return data ? data.cidadaosCombo[0] : null;
}

async function getInfoUsuarioLogado(lotacaoId) {
    const QUERY = `query LotacaoAgendaSelect($id: ID!) {\n  lotacao(id: $id) {\n    unidadeSaude { id, nome } \n  }\n}\n`;
    const variables = { "id": lotacaoId };
    const data = await callGraphQL('LotacaoAgendaSelect', QUERY, variables);
    return data ? data.lotacao : null;
}

async function listarProfissionaisPorUBS(idUnidadeSaude) {
    const QUERY = `query ProfissionalTable($input: ProfissionaisQueryInput!) {\n  profissionais(input: $input) {\n    content {\n      id\n      nome\n      lotacoes {\n        id\n        hasConfiguracaoAgenda\n        cbo {\n          id\n          nome\n        }\n      }\n    }\n  }\n}\n`;
    const variables = { "input": { "unidadeSaudeId": idUnidadeSaude, "pageParams": { "sort": ["nome"] }, "mostrarSemLotacaoAtiva": true } };
    const data = await callGraphQL('ProfissionalTable', QUERY, variables);
    if (!data) return [];
    return data.profissionais.content.filter(prof => prof.lotacoes.some(lot => lot.hasConfiguracaoAgenda));
}

async function buscarHorariosLivres(idLotacao, dia) {
    const QUERY = `query HorarioAgendaSelectField($input: HorariosAgendaQueryInput!) {\n  horariosAgenda(input: $input) {\n    horario\n    isOcupado\n  }\n}\n`;
    const variables = { "input": { "lotacaoId": idLotacao, "dia": dia, "isAtencaoDomiciliar": false, "agendamentosIdsDesconsiderar": [] } };
    const data = await callGraphQL('HorarioAgendaSelectField', QUERY, variables);
    if (!data) return [];
    return data.horariosAgenda.filter(slot => !slot.isOcupado).map(slot => slot.horario);
}

async function criarAgendamento(idCidadao, idLotacao, timestampHorario) {
    const MUTATION = `mutation SalvarAgendamentoConsulta($input: CriarAgendamentoConsultaInput!) {\n  salvarAgendamentoConsulta(input: $input)\n}\n`;
    const variables = { "input": { "cidadao": idCidadao, "horario": timestampHorario, "isForaUbs": false, "lotacao": idLotacao } };
    const data = await callGraphQL('SalvarAgendamentoConsulta', MUTATION, variables);
    return data ? data.salvarAgendamentoConsulta : null;
}


// 3. SIMULAÇÃO

async function iniciarSimulacaoInterativa() {
    console.log("--- Simulador de Agendamento (com Filtro de UBS) ---");

    console.log("PASSO 0: Verificando a Unidade de Saúde do seu usuário...");
    const infoUsuario = await getInfoUsuarioLogado(ID_LOTACAO_USUARIO_LOGADO);
    if (!infoUsuario || !infoUsuario.unidadeSaude) { 
        console.log("Não foi possível encontrar a Unidade de Saúde para o seu usuário. Verifique o ID da Lotação."); 
        return; 
    }
    console.log(`-> Seu usuário pertence à UBS: "${infoUsuario.unidadeSaude.nome}" (ID: ${infoUsuario.unidadeSaude.id})\n`);

    const nomeCidadao = await askQuestion("PASSO 1: Digite o nome ou CPF do cidadão para buscar: ");
    const cidadao = await buscarCidadao(nomeCidadao);
    if (!cidadao) { console.log("Cidadão não encontrado."); return; }
    console.log(`-> Cidadão encontrado: ${cidadao.nome} (ID: ${cidadao.id})\n`);

    console.log(`PASSO 2: Buscando profissionais com agenda APENAS na sua UBS...`);
    const profissionais = await listarProfissionaisPorUBS(infoUsuario.unidadeSaude.id);
    if (profissionais.length === 0) {
        console.log("Nenhum profissional com agenda configurada foi encontrado na sua Unidade de Saúde.");
        return;
    }

    console.log("\nProfissionais com agenda na sua UBS. Escolha um:");
    profissionais.forEach((prof, index) => {
        const especialidades = prof.lotacoes
            .filter(l => l.hasConfiguracaoAgenda)
            .map(l => l.cbo.nome)
            .join(', ');
        console.log(`  ${index + 1}: ${prof.nome} (${especialidades})`);
    });
    
    const escolhaProfissionalIndex = parseInt(await askQuestion("Digite o número do profissional desejado: "), 10) - 1;

    if (isNaN(escolhaProfissionalIndex) || escolhaProfissionalIndex < 0 || escolhaProfissionalIndex >= profissionais.length) {
        console.log("Opção de profissional inválida.");
        return;
    }
    const profissionalEscolhido = profissionais[escolhaProfissionalIndex];
    
    const lotacoesDisponiveis = profissionalEscolhido.lotacoes.filter(l => l.hasConfiguracaoAgenda);
    
    let lotacaoEscolhida;
    if (lotacoesDisponiveis.length === 1) {
        lotacaoEscolhida = lotacoesDisponiveis[0];
    } else {
        console.log("\nEscolha a especialidade para este profissional:");
        lotacoesDisponiveis.forEach((lot, index) => {
            console.log(`  ${index + 1}: ${lot.cbo.nome}`);
        });
        const escolhaLotacaoIndex = parseInt(await askQuestion("Digite o número da especialidade desejada: "), 10) - 1;
        if (isNaN(escolhaLotacaoIndex) || escolhaLotacaoIndex < 0 || escolhaLotacaoIndex >= lotacoesDisponiveis.length) {
            console.log("Opção de especialidade inválida.");
            return;
        }
        lotacaoEscolhida = lotacoesDisponiveis[escolhaLotacaoIndex];
    }
    
    const idLotacao = lotacaoEscolhida.id;
    console.log(`-> Você escolheu: ${profissionalEscolhido.nome} como ${lotacaoEscolhida.cbo.nome} (ID de Lotação: ${idLotacao})\n`);

    const diaEscolhido = await askQuestion("PASSO 3: Digite o dia para o agendamento (formato AAAA-MM-DD): ");
    console.log("Buscando horários livres...");
    const horariosLivres = await buscarHorariosLivres(idLotacao, diaEscolhido);
    if (horariosLivres.length === 0) {
        console.log("Nenhum horário livre encontrado para este profissional neste dia.");
        return;
    }
    
    console.log("\nPASSO 4: Horários livres encontrados. Escolha um:");
    horariosLivres.forEach((timestamp, index) => {
        const horaFormatada = new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' });
        console.log(`  ${index + 1}: ${horaFormatada}`);
    });
    const escolhaHorarioIndex = parseInt(await askQuestion("Digite o número do horário desejado: "), 10) - 1;
    
    if (isNaN(escolhaHorarioIndex) || escolhaHorarioIndex < 0 || escolhaHorarioIndex >= horariosLivres.length) {
        console.log("Opção de horário inválida.");
        return;
    }
    
    const timestampAgendamento = horariosLivres[escolhaHorarioIndex];
    const horarioEscolhidoFormatado = new Date(timestampAgendamento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' });
    
    console.log("\n--- Revisão do Agendamento ---");
    console.log("Cidadão:", cidadao.nome);
    console.log("Profissional:", profissionalEscolhido.nome);
    console.log("Especialidade:", lotacaoEscolhida.cbo.nome);
    console.log("Data:", diaEscolhido);
    console.log("Horário:", horarioEscolhidoFormatado);
    const confirmacao = await askQuestion("Confirmar agendamento? (s/n): ");

    if (confirmacao.toLowerCase() !== 's') {
        console.log("Agendamento cancelado.");
        return;
    }

    console.log("\nEnviando para agendamento...");
    const novoAgendamentoId = await criarAgendamento(cidadao.id, idLotacao, timestampAgendamento);

    if (novoAgendamentoId) {
        console.log("\n--- AGENDAMENTO REALIZADO COM SUCESSO! ---");
        console.log(`ID do novo agendamento: ${novoAgendamentoId}`);
    } else {
        console.log("\n--- FALHA AO REALIZAR O AGENDAMENTO ---");
    }
}

iniciarSimulacaoInterativa().finally(() => rl.close());