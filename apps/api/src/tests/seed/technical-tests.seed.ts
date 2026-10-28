/**
 * FASE 23 — the built-in Technical Test catalog, as plain data. No Prisma
 * import needed (`Test`/`Question` have no domain-specific enum fields —
 * `category` is a free-text string by design, see technical-tests.md §3).
 * `prisma/seed-technical-tests.ts` upserts these rows, and
 * `tests.e2e-spec.ts` seeds from this exact array rather than re-typing the
 * questions, so the two can never drift apart — same convention
 * `resume-templates.seed.ts` (Phase 11) established.
 *
 * Every `id` (both test and question) is a stable, human-readable slug, not
 * a random uuid — `Test`/`Question.id` both default to `@default(uuid())`,
 * which only applies when the field is omitted; supplying our own stable id
 * makes re-seeding an idempotent `upsert`, not an ever-growing set of
 * duplicate rows.
 *
 * `timeLimit` is in MINUTES (see technical-test.interface.ts's
 * `TIME_LIMIT_UNIT`). `correctAnswer` is always the exact text of one of
 * `choices` — the scoring util does a strict string match, never a fuzzy
 * one.
 */
export interface TechnicalTestQuestionSeed {
  id: string;
  prompt: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
}

export interface TechnicalTestSeed {
  id: string;
  title: string;
  category: string;
  timeLimit: number;
  questions: TechnicalTestQuestionSeed[];
}

export const TECHNICAL_TEST_SEED: TechnicalTestSeed[] = [
  {
    id: 'tt-programming-fundamentals',
    title: 'Fundamentos de Programação',
    category: 'Programming',
    timeLimit: 15,
    questions: [
      {
        id: 'tt-programming-fundamentals-q1',
        prompt:
          'Qual estrutura de dados segue o princípio "primeiro a entrar, primeiro a sair" (FIFO)?',
        choices: ['Pilha (Stack)', 'Fila (Queue)', 'Árvore (Tree)', 'Grafo (Graph)'],
        correctAnswer: 'Fila (Queue)',
        explanation:
          'Uma fila (queue) processa elementos na ordem em que chegam — o primeiro a ser adicionado é o primeiro a ser removido (FIFO). Uma pilha (stack) segue o princípio oposto, LIFO.',
      },
      {
        id: 'tt-programming-fundamentals-q2',
        prompt:
          'Qual é a complexidade de tempo, no pior caso, de uma pesquisa binária num array ordenado de N elementos?',
        choices: ['O(N)', 'O(N log N)', 'O(log N)', 'O(1)'],
        correctAnswer: 'O(log N)',
        explanation:
          'A pesquisa binária elimina metade do espaço de pesquisa a cada comparação, resultando em complexidade logarítmica O(log N).',
      },
      {
        id: 'tt-programming-fundamentals-q3',
        prompt: 'Em programação orientada a objetos, o que é "encapsulamento"?',
        choices: [
          'A capacidade de uma classe herdar de várias classes',
          'Esconder os detalhes internos de um objeto e expor apenas uma interface controlada',
          'A capacidade de um método ter várias implementações',
          'A criação de múltiplas instâncias da mesma classe',
        ],
        correctAnswer:
          'Esconder os detalhes internos de um objeto e expor apenas uma interface controlada',
        explanation:
          'Encapsulamento é o princípio de restringir o acesso direto aos dados internos de um objeto, expondo apenas o que é necessário através de métodos públicos.',
      },
      {
        id: 'tt-programming-fundamentals-q4',
        prompt: 'Qual destas opções descreve corretamente uma função recursiva?',
        choices: [
          'Uma função que nunca retorna um valor',
          'Uma função que chama a si própria até atingir uma condição de paragem',
          'Uma função que só pode ser chamada uma vez',
          'Uma função executada em paralelo com outras',
        ],
        correctAnswer: 'Uma função que chama a si própria até atingir uma condição de paragem',
        explanation:
          'Recursividade é a técnica em que uma função se invoca a si mesma, sempre com um caso base que interrompe as chamadas sucessivas.',
      },
      {
        id: 'tt-programming-fundamentals-q5',
        prompt: 'O que significa a sigla "API"?',
        choices: [
          'Application Programming Interface',
          'Automated Process Integration',
          'Advanced Program Instruction',
          'Application Process Index',
        ],
        correctAnswer: 'Application Programming Interface',
        explanation:
          'API (Application Programming Interface) é um conjunto de regras que permite que diferentes sistemas de software comuniquem entre si.',
      },
    ],
  },
  {
    id: 'tt-sql-basics',
    title: 'SQL Básico',
    category: 'SQL',
    timeLimit: 10,
    questions: [
      {
        id: 'tt-sql-basics-q1',
        prompt: 'Qual comando SQL é usado para obter dados de uma tabela?',
        choices: ['GET', 'SELECT', 'FETCH', 'OPEN'],
        correctAnswer: 'SELECT',
        explanation:
          'O comando SELECT é usado para consultar e obter dados de uma ou mais tabelas.',
      },
      {
        id: 'tt-sql-basics-q2',
        prompt: 'Qual cláusula é usada para filtrar registos numa consulta SQL?',
        choices: ['FILTER', 'WHERE', 'HAVING ONLY', 'LIMIT'],
        correctAnswer: 'WHERE',
        explanation:
          'A cláusula WHERE filtra registos com base numa condição, antes de qualquer agrupamento (GROUP BY).',
      },
      {
        id: 'tt-sql-basics-q3',
        prompt:
          'Qual tipo de JOIN devolve apenas as linhas com correspondência em ambas as tabelas?',
        choices: ['LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL OUTER JOIN'],
        correctAnswer: 'INNER JOIN',
        explanation:
          'O INNER JOIN devolve apenas as linhas em que existe correspondência em ambas as tabelas envolvidas.',
      },
      {
        id: 'tt-sql-basics-q4',
        prompt: 'Qual comando SQL adiciona uma nova linha a uma tabela?',
        choices: ['INSERT INTO', 'ADD ROW', 'CREATE ROW', 'APPEND'],
        correctAnswer: 'INSERT INTO',
        explanation: 'O comando INSERT INTO é usado para adicionar novos registos a uma tabela.',
      },
    ],
  },
  {
    id: 'tt-data-analysis',
    title: 'Análise de Dados',
    category: 'Data',
    timeLimit: 12,
    questions: [
      {
        id: 'tt-data-analysis-q1',
        prompt:
          'Qual medida estatística representa o valor central de um conjunto de dados ordenado?',
        choices: ['Média', 'Mediana', 'Moda', 'Desvio padrão'],
        correctAnswer: 'Mediana',
        explanation:
          'A mediana é o valor que separa a metade superior da metade inferior de um conjunto de dados ordenado.',
      },
      {
        id: 'tt-data-analysis-q2',
        prompt: 'O que mede o desvio padrão num conjunto de dados?',
        choices: [
          'A tendência central dos dados',
          'A dispersão dos dados em torno da média',
          'O valor mais frequente',
          'O número total de observações',
        ],
        correctAnswer: 'A dispersão dos dados em torno da média',
        explanation:
          'O desvio padrão quantifica o quanto os valores individuais se afastam, em média, da média do conjunto.',
      },
      {
        id: 'tt-data-analysis-q3',
        prompt: 'Qual formato de ficheiro é mais comum para dados tabulares simples?',
        choices: ['CSV', 'MP3', 'EXE', 'ZIP'],
        correctAnswer: 'CSV',
        explanation:
          'CSV (Comma-Separated Values) é um formato de texto simples e amplamente usado para representar dados tabulares.',
      },
      {
        id: 'tt-data-analysis-q4',
        prompt: 'Numa correlação de -0.9 entre duas variáveis, o que se pode concluir?',
        choices: [
          'Não existe relação entre as variáveis',
          'Existe uma forte relação positiva',
          'Existe uma forte relação negativa (inversa)',
          'Os dados estão corrompidos',
        ],
        correctAnswer: 'Existe uma forte relação negativa (inversa)',
        explanation:
          'Um coeficiente de correlação próximo de -1 indica uma forte relação inversa: quando uma variável aumenta, a outra tende a diminuir.',
      },
    ],
  },
];
