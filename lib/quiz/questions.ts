// Static question bank for the Phase 1 daily-quiz coin-earning mechanic
// (docs/coin-roadmap.md). Deliberately code, not a DB table — this is a
// lightweight engagement feature, not the app's actual legal source of
// truth (that's the RAG pipeline over uploaded PDFs). Content here is
// thematically plausible Azerbaijan traffic-rule trivia, not guaranteed to
// be a verbatim/legally-precise quote of "Yol Hərəkəti Qaydaları".
export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    question: 'Yaşayış massivlərində sürət həddi, əks halda başqa məhdudiyyət qoyulmayıbsa, adətən neçə km/saatdır?',
    options: ['20 km/saat', '60 km/saat', '90 km/saat', '110 km/saat'],
    correctIndex: 0,
  },
  {
    question: 'Şəhər ərazisində, yol nişanları ilə başqa cür göstərilməyibsə, ümumi sürət həddi neçə km/saatdır?',
    options: ['40 km/saat', '60 km/saat', '80 km/saat', '100 km/saat'],
    correctIndex: 1,
  },
  {
    question: 'Magistral yollarda (avtomobil yolu) yüngül avtomobillər üçün maksimum icazə verilən sürət adətən neçədir?',
    options: ['90 km/saat', '110 km/saat', '130 km/saat', '150 km/saat'],
    correctIndex: 2,
  },
  {
    question: 'Tənzimlənməyən yol qovşağında, əsas yol nişanı olmadıqda, üstünlük hansı sürücüyə verilir?',
    options: [
      'Sürəti daha yüksək olan sürücüyə',
      'Sağdan yaxınlaşan nəqliyyat vasitəsinə',
      'Soldan yaxınlaşan nəqliyyat vasitəsinə',
      'Ölçüsü daha böyük olan nəqliyyat vasitəsinə',
    ],
    correctIndex: 1,
  },
  {
    question: 'Piyada keçidində piyada olduqda sürücü nə etməlidir?',
    options: [
      'Siqnal verib keçməyə davam etməli',
      'Sürəti azaltmadan keçməli',
      'Dayanıb piyadanın keçməsinə imkan verməli',
      'Yalnız gecə vaxtı dayanmalı',
    ],
    correctIndex: 2,
  },
  {
    question: 'Təhlükəsizlik kəməri ilə bağlı hansı ifadə doğrudur?',
    options: [
      'Yalnız sürücü üçün mütləqdir',
      'Yalnız şəhərlərarası yollarda mütləqdir',
      'Sürücü və bütün sərnişinlər üçün mütləqdir',
      'Yalnız ön oturacaqda əyləşənlər üçün mütləqdir',
    ],
    correctIndex: 2,
  },
  {
    question: 'Uşaqların avtomobildə daşınması ilə bağlı əsas qayda hansıdır?',
    options: [
      'Uşaqlar həmişə ön oturacaqda əyləşməlidir',
      'Müəyyən yaş/boydan kiçik uşaqlar üçün xüsusi uşaq oturacağı tələb olunur',
      'Uşaqlar üçün təhlükəsizlik kəməri tələb olunmur',
      'Uşaqlar yalnız sürücünün dizində otura bilər',
    ],
    correctIndex: 1,
  },
  {
    question: 'Sürücülər üçün qanla icazə verilən alkoqol həddi ilə bağlı ümumi qayda hansıdır?',
    options: [
      'Alkoqol miqdarına məhdudiyyət yoxdur',
      'Sıfıra yaxın, ciddi məhdudlaşdırılmış hədd tətbiq olunur',
      'Yalnız gecə saatlarında məhdudiyyət var',
      'Yalnız peşəkar sürücülərə aiddir',
    ],
    correctIndex: 1,
  },
  {
    question: '"Dayanmaq qadağandır" nişanı nəyi bildirir?',
    options: [
      'Sürəti azaltmaq lazımdır',
      'Qısa müddətə dayanmaq olar, dayanacaq olmaz',
      'Nəqliyyat vasitəsinin dayanması və durması tamamilə qadağandır',
      'Yalnız yük maşınlarına aiddir',
    ],
    correctIndex: 2,
  },
  {
    question: 'Qırmızı işıq yanarkən sürücü nə etməlidir?',
    options: [
      'Sürəti azaldıb ehtiyatla keçməli',
      'Dayanma xəttinin qarşısında tam dayanmalı',
      'Yalnız piyada olmadıqda keçə bilər',
      'Signal verərək keçməyə davam edə bilər',
    ],
    correctIndex: 1,
  },
  {
    question: 'Mobil telefonla danışmaq sürücülük zamanı hansı halda icazəlidir?',
    options: [
      'Həmişə icazəlidir',
      'Yalnız əl sərbəst (hands-free) qurğu ilə icazəlidir',
      'Yalnız şəhərdən kənarda icazəlidir',
      'Yalnız svetoforda dayandıqda icazəlidir',
    ],
    correctIndex: 1,
  },
  {
    question: 'Üçbucaq formalı, qırmızı haşiyəli xəbərdarlıq nişanları nəyi bildirir?',
    options: [
      'Qadağanı',
      'Məcburi istiqaməti',
      'Yol boyu mümkün təhlükə barədə xəbərdarlığı',
      'Dayanacaq yerinin olduğunu',
    ],
    correctIndex: 2,
  },
  {
    question: 'Avtomobilin qabaqlama (ötmə) manevri zamanı əsas qayda hansıdır?',
    options: [
      'Yalnız düz yol hissəsində və qarşıdan gələn nəqliyyat olmadıqda ötmək olar',
      'İstənilən yerdə ötmək olar',
      'Yalnız gecə vaxtı ötmək olar',
      'Ötmə yalnız magistral yollarda qadağandır',
    ],
    correctIndex: 0,
  },
];

// Deterministically picks one question per user per calendar day, seeded by
// date + userId so re-renders/refreshes show the same question all day
// (no reshuffling on every request) but different users — and the same
// user on different days — generally see different questions. Simple
// string hash (djb2-style), not cryptographic — this only needs to be
// stable and roughly uniform, not secure.
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

export interface DailyQuizQuestion extends QuizQuestion {
  index: number;
}

export function getDailyQuestionForUser(userId: string, date: Date): DailyQuizQuestion {
  const dateKey = date.toISOString().slice(0, 10); // YYYY-MM-DD, UTC calendar day
  const seed = hashString(`${dateKey}:${userId}`);
  const index = seed % QUIZ_QUESTIONS.length;
  const picked = QUIZ_QUESTIONS[index];

  return { ...picked, index };
}
