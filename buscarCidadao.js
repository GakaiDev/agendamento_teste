const axios = require('axios');


const GRAPHQL_ENDPOINT = 'https://esustreinamento.mossoro.rn.gov.br/api/graphql';

const COOKIE_DE_SESSAO = 'JSESSIONID=; XSRF-TOKEN='; 

const TOKEN_XSRF = ''; 


const nomeDoCidadaoParaBuscar = "jose"; 



const QUERY_BUSCAR_CIDADAO = `
    query CidadaoAtendimentoSelectField($input: CidadaosComboQueryInput!, $emAtencaoDomiciliar: Boolean!, $retrieveContato: Boolean!) {
        cidadaosCombo(input: $input, atencaoDomiciliar: $emAtencaoDomiciliar) {
            id
            nome
            nomeSocial
            cpf
            cns
            dataNascimento
            contato @include(if: $retrieveContato) {
                id
                telefoneCelular
                email
            }
        }
    }
`;

const variaveisDaQuery = {
    "input": {
        "query": nomeDoCidadaoParaBuscar,
        "ativo": true,
        "obito": false,
        "limit": 10
    },
    "emAtencaoDomiciliar": false, 
    "retrieveContato": true
};


async function testarBuscaCidadao() {
    console.log(`Buscando cidadão com o nome: "${nomeDoCidadaoParaBuscar}"...`);

    try {
        const response = await axios.post(
            GRAPHQL_ENDPOINT,
            {
                operationName: 'CidadaoAtendimentoSelectField',
                query: QUERY_BUSCAR_CIDADAO,
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
            console.log("Busca realizada com sucesso!");
            const resultados = response.data.data.cidadaosCombo;
            console.log(`Encontrados ${resultados.length} resultados.`);
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

testarBuscaCidadao();
