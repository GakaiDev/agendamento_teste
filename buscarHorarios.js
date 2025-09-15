const axios = require('axios');


const GRAPHQL_ENDPOINT = 'https://esustreinamento.mossoro.rn.gov.br/api/graphql';

const COOKIE_DE_SESSAO = 'JSESSIONID=; XSRF-TOKEN='; 

const TOKEN_XSRF = ''; 


const diaParaBuscar = "2025-09-16"; 
const idDoProfissional = "1127";



const QUERY_BUSCAR_HORARIOS = `
    query HorarioAgendaSelectField($input: HorariosAgendaQueryInput!) {
        horariosAgenda(input: $input) {
            horario
            duracao
            isOcupado
        }
    }
`;

const variaveisDaQuery = {
    "input": {
        "lotacaoId": idDoProfissional,
        "dia": diaParaBuscar,
        "isAtencaoDomiciliar": false,
        "agendamentosIdsDesconsiderar": []
    }
};


async function testarBuscaHorariosLivres() {
    console.log(`Buscando horários para o dia ${diaParaBuscar}...`);

    try {
        const response = await axios.post(
            GRAPHQL_ENDPOINT,
            {
                operationName: 'HorarioAgendaSelectField',
                query: QUERY_BUSCAR_HORARIOS,
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
            const todosHorarios = response.data.data.horariosAgenda;
            console.log(`Total de ${todosHorarios.length} horários encontrados para o dia.`);

            const horariosLivres = todosHorarios.filter(slot => !slot.isOcupado);

            console.log(`\n--- ${horariosLivres.length} HORÁRIOS LIVRES ENCONTRADOS ---`);
            
            const listaDeHorarios = horariosLivres.map(slot => slot.horario);
            console.log(listaDeHorarios);
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

testarBuscaHorariosLivres();