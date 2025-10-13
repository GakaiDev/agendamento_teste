const axios = require('axios');


const GRAPHQL_ENDPOINT = 'https://esustreinamento.mossoro.rn.gov.br/api/graphql';


const COOKIE_DE_SESSAO = 'JSESSIONID=Gea3gQUz-vgdu5A0ChsvThxtdq4xZDUzlMpEYoPm; XSRF-TOKEN=e512ca87-aaab-404f-95a1-76a25b10dd41';
const TOKEN_XSRF = '';



const cboIdParaBuscar = "490"; 



const QUERY_BUSCAR_PROFISSIONAIS = `
    query ProfissionalTable($input: ProfissionaisQueryInput!) {
        profissionais(input: $input) {
            content {
                id
                nome
                nomeSocial
                lotacoes {
                    id
                    ativo
                    cbo {
                        id
                        nome
                    }
                }
            }
        }
    }
`;

const variaveisDaQuery = {
    "input": {
        "cboId": cboIdParaBuscar, 
        "pageParams": { "sort": ["nome"] },
        "mostrarSemLotacaoAtiva": true
    }
};

async function testarBuscaProfissionais() {
    console.log(`Buscando profissionais com o CBO ID: "${cboIdParaBuscar}"...`);

    try {
        const response = await axios.post(
            GRAPHQL_ENDPOINT,
            {
                operationName: 'ProfissionalTable',
                query: QUERY_BUSCAR_PROFISSIONAIS,
                variables: variaveisDaQuery
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
            console.error("A API retornou um erro:", JSON.stringify(response.data.errors, null, 2));
        } else {
            const resultados = response.data.data.profissionais.content;
            console.log(`Encontrados ${resultados.length} profissionais.`);
            console.log("Para cada profissional, o ID de lotação é o que deve ser usado para agendar.");
            console.log(JSON.stringify(resultados, null, 2));
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

testarBuscaProfissionais();