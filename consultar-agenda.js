const axios = require('axios');


const GRAPHQL_ENDPOINT = 'https://esustreinamento.mossoro.rn.gov.br/api/graphql';

const COOKIE_DE_SESSAO = 'JSESSIONID=; XSRF-TOKEN=';

const corpoDaRequisicao = [{
    "operationName": "AgendamentosDiaLotacao",
    "variables": {
        "input": {
            "lotacaoId": "1127",
            "dataAgendadoInicio": "2025-09-15T03:00:00.000Z",
            "dataAgendadoFim": "2025-09-15T03:00:00.000Z",
            "situacao": ["AGENDADO", "CIDADAO_PRESENTE_NA_UNIDADE", "NAO_COMPARECEU", "ATENDIMENTO_REALIZADO", "NAO_AGUARDOU"]
        }
    },
    "query": "query AgendamentosDiaLotacao($input: AgendadosQueryInput!) {\n  agendados(input: $input) {\n    content {\n      id\n      horarioInicial\n      situacao\n      cidadao {\n        id\n        nome\n      }\n    }\n  }\n}"
}];


async function testarConsultaDeAgenda() {
    console.log("Tentando consultar a agenda do dia 15/09/2025...");

    try {
        const response = await axios.post(
            GRAPHQL_ENDPOINT,
            corpoDaRequisicao, 
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': COOKIE_DE_SESSAO,
                    'Referer': 'https://esustreinamento.mossoro.rn.gov.br/agenda/1127/15092025' 
                }
            }
        );

        console.log("\n--- SUCESSO! ---");
        console.log("A comunicação com a API funcionou.");
        console.log("Resposta do servidor:");
        console.log(JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error("\n--- FALHA! ---");
        if (error.response) {
            console.error("Erro na chamada de rede:", error.response.status, error.response.statusText);
            console.error("Detalhes:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Erro ao executar o script:", error.message);
        }
    }
}

testarConsultaDeAgenda();