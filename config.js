/* ============================================================================
   CONFIG — the only file to edit after delivery.
   - API_URL: the Cloudflare Worker (worker/). It stores answers, copies them to the
     Google Sheet every minute, and serves the questions written in the Sheet's
     "Questions" tab. Empty = mock mode (answers stay in this browser).
     On localhost the mock is always used so tests never write real data; add ?live=1
     to use the real API locally.
   - SERIES: each series of QR codes (?s=1, 2, 3) has its own questions and language.
   - Open-question series (1 and 3): the questions are written in the Google Sheet (tab "Questions"),
     not here. TEXT.<lang>.defaultQuestion is shown when a question is empty or not available.
   - Quiz series (mode: 'quiz', series 2): multiple-choice questions written below in QUIZ.
     A right answer earns the star; a wrong one does not, and the pillar cannot be played again.
     Back to open questions: delete the line mode: 'quiz' (before the event only).
   - Placeholder texts ("TODO", "lorem ipsum"), a text missing in one language and an empty
     API_URL are reported as a warning in the browser console (never shown to participants).
   ========================================================================== */
export const CONFIG = {
  API_URL: 'https://quality-passport-api.videoclubz.workers.dev',
  EVENT: 'World Quality Week 2026',
  PROGRAM: 'Quality Powering Performance',   // the programme behind the 4 pillars
  LOGO: 'assets/logo.png',                   // programme visual, shown in full on the home screen
  LOGO_MARK: 'assets/logo-mark.png',         // square crop of the Q, for round medallions (headers, star, PDF)
  MIN_CHARS: 1,
  MAX_CHARS: 2000,
  // Series of QR codes, one per location. The series sets the language of the whole app.
  SERIES: {
    1: { lang: 'fr' },
    2: { lang: 'en', mode: 'quiz' },
    3: { lang: 'en' },
  },
  // Quiz of each quiz series: one question per pillar, options shown A to D, `answer` = the right letter.
  // Series 2: questions and answers given by the Quality team on 3 Nov 2026.
  QUIZ: {
    2: {
      1: {
        question: 'How does Quality help ensure business continuity?',
        options: {
          A: 'By assessing risks, planning preventively and collaborating across functions',
          B: 'By reducing product prices',
          C: 'By reacting only after disruptions occur',
          D: 'By increasing the number of approvals required',
        },
        answer: 'A',
      },
      2: {
        question: 'What is the main benefit of effective complaint management?',
        options: {
          A: 'Reducing the number of patients using the product',
          B: 'Eliminating the need for documentation',
          C: 'Shortening regulatory requirements',
          D: 'Learning from feedback to improve quality, compliance and patient protection',
        },
        answer: 'D',
      },
      3: {
        question: 'Why are approved templates valuable?',
        options: {
          A: 'They make documents longer',
          B: 'They replace content review',
          C: 'They reduce errors, save time and simplify reviews',
          D: 'They eliminate the need for training',
        },
        answer: 'C',
      },
      4: {
        question: 'At what point should Quality become involved in an innovative (GxP) project?',
        options: {
          A: 'When the idea is ready to launch',
          B: 'When a problem occurs',
          C: 'From the start',
          D: 'As the final checkpoint in the flow',
        },
        answer: 'C',
      },
    },
  },
  // Pillar names are programme names: the same in every language.
  PILLARS: [
    { id: 1, name: 'Quality as Enabler', icon: 'clapper' },
    { id: 2, name: 'Building Trust', icon: 'handshake' },
    { id: 3, name: 'Efficiency & Speed', icon: 'bolt' },
    { id: 4, name: 'Quality Driving Innovation', icon: 'bulb' },
  ],
  // Ipsen palette (ipsen.com). The star gold is the only non-Ipsen colour.
  THEME: { primary: '#000e56', accent: '#2797d3', surface: '#edebe4', star: '#e3a900' },
  // Pillar icons available: clapper, handshake, bolt, bulb (see js/icons.js).
  // French texts: non-breaking space ( ) before : ? ! and inside "QR code".
  TEXT: {
    en: {
      // Page
      pageTitle: 'Quality Passport',
      fileName: 'Quality-Passport',          // passport file: Quality-Passport.pdf
      // Welcome
      welcomeTitle: 'Get your Quality Passport',
      welcomeSubtitle: 'Four pillars, one question each. Every answer earns a star.',
      emailLabel: 'Your work email',
      emailInvalid: 'Please enter a valid email address.',
      emailNotice: 'Answers are saved with your email and read by the Quality team.',
      continue: 'Start',
      checking: 'Checking your stars…',
      checkingSlow: 'This can take a few seconds.',
      loadingQuestion: 'Loading the question…',
      // Question
      pillarLabel: 'Pillar {n} of 4',
      defaultQuestion: 'Tell us what you took away from it.',
      questionIntro: 'No right or wrong answer. Just yours.',
      answerHint: 'Take a moment. Your thoughts matter more than your spelling.',   // placeholder of the answer field
      submit: 'Stamp my passport',
      myPassport: 'Passport',
      // Passport
      passportTitle: 'My Quality Passport',
      count: '{n} of 4',
      starEarned: 'Star earned',
      alreadyStamped: 'Already stamped',
      nextHint: 'Head to the pillar of your choice and scan its QR code.',
      toDiscover: 'To discover',             // a pillar stays hidden until its QR code is scanned
      pillarEarnedLabel: '{pillar}: star earned',   // read by screen readers
      completeTitle: 'Passport complete',
      completeSubtitle: 'Show this screen to collect your goodies.',
      openPassport: 'Get my Quality Passport',
      // Sending status (the star is lit at once; the answer is sent in the background)
      saving: 'Saving your answer…',
      saved: 'Answer saved',
      waiting: 'Saved on your phone. It will be sent automatically.',
      // Celebration
      celebrationTitle: 'Four pillars. Four stars.',
      celebrationSubtitle: 'Your Quality Passport is complete.',
      editName: 'Edit name',
      holderLabel: 'Name on your passport',
      share: 'Share',                        // shares the passport PDF (downloads it where sharing files is not possible)
      download: 'Download my passport',
      preparing: 'Preparing…',
      pdfFallback: 'The PDF tool could not load. Your passport was saved as an image instead.',
      close: 'Done',
      // Passport document (PDF and certificate)
      docTitle: 'Quality Passport',
      docCertifies: 'This certifies that',
      docLine: 'has earned the four stars of {program}',
      docCompleted: 'Completed on {date}',
      // Quiz (series 2): welcome rule, question screen, passport, end screen with fewer than 4 stars
      quizWelcomeSubtitle: 'Four pillars, one question each, one try. Every right answer earns a star.',
      quizIntro: 'One try. Choose carefully.',
      quizOption: 'Answer {letter}',         // read by screen readers before the option
      quizConfirm: 'Confirm my answer',
      quizRight: 'Right answer. Star earned.',
      quizWrong: 'Not quite. The right answer is {letter}.',
      quizContinue: 'Continue',
      answeredNoStar: 'Answered, no star',   // passport card after a wrong answer
      alreadyAnswered: 'Already answered',   // passport card when a pillar answered wrongly is scanned again
      noStar: 'No star',                     // under that pillar on the passport
      pillarMissedLabel: '{pillar}: answered, no star',   // read by screen readers
      quizDoneTitle: 'Quiz complete',
      quizDoneScore: '{n} of 4 stars',
      seeResult: 'See my result',
      // End screen: never a "next time", a pillar is played once
      resultTitle0: 'Four pillars explored.',
      resultTitle1: 'Four pillars. One star.',
      resultTitle2: 'Four pillars. Two stars.',
      resultTitle3: 'Four pillars. Three stars.',
      resultSubtitle: 'Thank you for taking part.\nQuality is a habit, not a score.',
    },
    fr: {
      pageTitle: 'Passeport Qualité',
      fileName: 'Passeport-Qualite',
      welcomeTitle: 'Votre Passeport Qualité',
      welcomeSubtitle: 'Quatre piliers, une question par pilier. Chaque réponse rapporte une étoile.',
      emailLabel: 'Votre e-mail professionnel',
      emailInvalid: 'Saisissez une adresse e-mail valide.',
      emailNotice: 'Vos réponses sont enregistrées avec votre e-mail et lues par l’équipe Qualité.',
      continue: 'Commencer',
      checking: 'Recherche de vos étoiles…',
      checkingSlow: 'Cela peut prendre quelques secondes.',
      loadingQuestion: 'Chargement de la question…',
      pillarLabel: 'Pilier {n} sur 4',
      defaultQuestion: 'Dites-nous ce que vous en retenez.',
      questionIntro: 'Pas de bonne ou de mauvaise réponse. Juste la vôtre.',
      answerHint: 'Prenez un moment. Vos idées comptent plus que votre orthographe.',
      submit: 'Tamponner mon passeport',
      myPassport: 'Passeport',
      passportTitle: 'Mon Passeport Qualité',
      count: '{n} sur 4',
      starEarned: 'Étoile gagnée',
      alreadyStamped: 'Déjà tamponné',
      nextHint: 'Rendez-vous au pilier de votre choix et scannez son QR code.',
      toDiscover: 'À découvrir',
      pillarEarnedLabel: '{pillar} : étoile gagnée',
      completeTitle: 'Passeport complet',
      completeSubtitle: 'Montrez cet écran pour récupérer vos goodies.',
      openPassport: 'Obtenir mon Passeport Qualité',
      saving: 'Enregistrement de votre réponse…',
      saved: 'Réponse enregistrée',
      waiting: 'Gardée sur votre téléphone. Elle sera envoyée automatiquement.',
      celebrationTitle: 'Quatre piliers. Quatre étoiles.',
      celebrationSubtitle: 'Votre Passeport Qualité est complet.',
      editName: 'Modifier le nom',
      holderLabel: 'Nom sur votre passeport',
      share: 'Partager',
      download: 'Télécharger mon passeport',
      preparing: 'Préparation…',
      pdfFallback: 'L’outil PDF n’a pas pu se charger. Votre passeport a été enregistré en image.',
      close: 'Terminé',
      docTitle: 'Passeport Qualité',
      docCertifies: 'Ce passeport certifie que',
      docLine: 'a obtenu les quatre étoiles de {program}',
      docCompleted: 'Obtenu le {date}',
      // Quiz : en français seulement si un participant de la série 2 scanne ensuite un QR de la série 1
      quizWelcomeSubtitle: 'Quatre piliers, une question par pilier, un seul essai. Chaque bonne réponse rapporte une étoile.',
      quizIntro: 'Un seul essai. Choisissez bien.',
      quizOption: 'Réponse {letter}',
      quizConfirm: 'Valider ma réponse',
      quizRight: 'Bonne réponse. Étoile gagnée.',
      quizWrong: 'Pas tout à fait. La bonne réponse est la {letter}.',
      quizContinue: 'Continuer',
      answeredNoStar: 'Répondu, sans étoile',
      alreadyAnswered: 'Déjà répondu',
      noStar: 'Sans étoile',
      pillarMissedLabel: '{pillar} : répondu, sans étoile',
      quizDoneTitle: 'Quiz terminé',
      quizDoneScore: 'Étoiles : {n} sur 4',
      seeResult: 'Voir mon résultat',
      resultTitle0: 'Quatre piliers explorés.',
      resultTitle1: 'Quatre piliers. Une étoile.',
      resultTitle2: 'Quatre piliers. Deux étoiles.',
      resultTitle3: 'Quatre piliers. Trois étoiles.',
      resultSubtitle: 'Merci de votre participation.\nLa qualité est une habitude, pas un score.',
    },
  },
};
