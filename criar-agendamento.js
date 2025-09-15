const axios = require('axios');


const GRAPHQL_ENDPOINT = 'https://esustreinamento.mossoro.rn.gov.br/api/graphql';

const COOKIE_DE_SESSAO = 'JSESSIONID='; 

const TOKEN_XSRF = ''; 



const MUTATION_CRIAR_AGENDAMENTO = `
    mutation SalvarAgendamentoConsulta($input: CriarAgendamentoConsultaInput!) {
        salvarAgendamentoConsulta(input: $input)
    }
`;

const variaveisDaMutation = {
    "input": {
        "cidadao": "547", 
        "horario": 1757941200000, 
        "isForaUbs": false,
        "lotacao": "1127" 
    }
};


async function testarInsercaoFinal() {
    console.log("Tentando criar agendamento com a MUTATION correta...");

    try {
        const response = await axios.post(
            GRAPHQL_ENDPOINT,
            {
                operationName: 'SalvarAgendamentoConsulta',
                query: MUTATION_CRIAR_AGENDAMENTO,
                variables: variaveisDaMutation
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': COOKIE_DE_SESSAO,
                    'X-XSRF-TOKEN': TOKEN_XSRF
                }
            }
        );

        console.log("\n--- SUCESSO! ---");
        
        if (response.data.errors) {
            console.error("A API retornou um erro de negócio:", JSON.stringify(response.data.errors, null, 2));
        } else {
            console.log("Agendamento criado com sucesso!");
            console.log("Resposta do Servidor:", JSON.stringify(response.data, null, 2));
        }

    } catch (error) {
        console.error("\n--- FALHA! ---");
        if (error.response) {
            console.error("Erro na chamada:", error.response.status, error.response.statusText);
            console.error("Detalhes:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Erro ao executar script:", error.message);
        }
    }
}

testarInsercaoFinal();