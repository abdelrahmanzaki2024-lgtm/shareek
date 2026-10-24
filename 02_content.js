/* ============================================================
   الجزء 2: المحتوى — الإعدادات الافتراضية، الألعاب، البطاقات، الجوائز
   مصدر الألعاب: مفاتيح إجابات «ألعاب الأمن الحيوي» الحلقات 1–4 وسندها العلمي.
   الإعدادات يمكن تعديلها من ورقة Config دون تعديل الكود.
   ============================================================ */
(function (C) {
  'use strict';

  /* ---------- الإعدادات الافتراضية (تُدمج مع ورقة Config) ---------- */
  var CONFIG = {
    appName: 'شريك الدفاع',
    points: {
      round: 10,            // جولة اليوم
      gameBase: 10,         // لعبة: 10 + حتى 20 حسب النتيجة (10 إلى 30)
      gameBonus: 20,
      video: 5,             // مشاهدة فيديو كامل (مرة لكل فيديو)
      card: 2,              // قراءة بطاقة معرفة (مرة لكل بطاقة)
      charter: 20,          // توقيع الميثاق
      baseline: 20,         // الاختبار الأول
      followup: 20,         // اختبار الشهر
      mizan: 5,             // أول استخدام لميزان التاجر
      weekGoal: 25,         // تحقيق الهدف الأسبوعي
      rateReply: 2,         // تقييم رد المسؤول
      suggestionAccepted: 100,
      inviteDone: 50,       // اكتمال تسجيل المدعو ودرسه الأول
      inviteClean: 100,     // أول زيارة بوابة نظيفة للمدعو
      gateClean: 40,        // 4 من 4
      gatePartial: 10       // 3 من 4
    },
    dailyDigitalCap: 40,    // سقف النقاط الرقمية اليومي قبل المضاعف
    gateMaxScoredPerDay: 2, // أقصى عدد زيارات بوابة تُحتسب في اليوم
    weekGoalDays: 4,        // أيام النشاط المطلوبة في الأسبوع
    freezesPerMonth: 2,     // إجازتان شهريًا لا تكسران السلسلة
    multipliers: [          // أسابيع متتالية → مضاعف (للنقاط الرقمية فقط)
      { weeks: 8, x: 2.0 }, { weeks: 4, x: 1.5 }, { weeks: 2, x: 1.2 }
    ],
    ranks: {
      r2: { goalWeeks: 2, cleanVisits: 1 },
      r3: { goalWeeks: 4, cleanRun: 3, points: 500 },
      amb: { m4: 6, m5: 12, m6: 24, invitesForElite: 1 }
    },
    limits: {
      ticketsPerDay: 5, repliesPerDay: 20, loginFails: 5, lockMinutes: 15,
      tokenDays: 30, staffTokenHours: 12, subjectMax: 80, bodyMax: 1200, registerPerDay: 150
    },
    collective: { weeklyTarget: 200 },   // جولات التجار المجمّعة المطلوبة أسبوعيًا لفتح امتياز «حائط الدفاع»
    followupAfterDays: 30,
    farmStaleHours: 24,
    ticketTypes: {          // مهل التصعيد بالساعات: toSup / toMgr (0 = لا يوجد)
      urgent:     { label: 'بلاغ عاجل',       hint: 'اشتباه مرض أو خلل في البوابة',       toSup: 2,  toMgr: 6,  sla: 2,  first: ['assistant', 'supervisor'] },
      obstacle:   { label: 'عائق',            hint: 'انتظار طويل، مشكلة تطهير، تصريح',    toSup: 24, toMgr: 48, sla: 24, first: ['assistant'] },
      inquiry:    { label: 'استفسار',         hint: 'سؤال عن إجراء أو موعد',              toSup: 24, toMgr: 48, sla: 24, first: ['assistant'] },
      complaint:  { label: 'شكوى من موظف',    hint: 'تصل للمشرف مباشرة ولا يراها الموظف', toSup: 0,  toMgr: 48, sla: 48, first: ['supervisor'] },
      suggestion: { label: 'اقتراح',          hint: 'فكرة تحسّن الشغل',                   toSup: 72, toMgr: 0,  sla: 72, first: ['supervisor'] }
    },
    facts: {                // أرقام نسبية فقط — لا مبالغ مالية (بعد اعتماد الإدارة لما يُنشر)
      mortalityDisease: '11.0%', mortalityNormal: '3.2%', febWave: '26.6%',
      kgPerChickHealthy: 2.036, kgPerChickDisease: 1.373,
      tonsPer100kHealthy: 204, tonsPer100kDisease: 137,
      egyptCulled: 'أكثر من 40 مليون طائر', egyptCulledSrc: 'FAO',
      cyclesHealthy: 35, cyclesDisease: 22, cyclesTotal: 90, periodLabel: 'فبراير 2025 – أغسطس 2026'
    },
    farms: 10,
    dailyRoundCards: true,
    market: {               // «السوق النهاردة»: أسعار بيع منتجات الشركة للتجار (يحدّثها الموظفون يوميًا)
      editRole: 'supervisor',   // الافتراضي لصلاحية نشر الأسعار لمن لم يُخصَّص له شيء (الفريق والصلاحيات)
      directRole: 'manager',    // الدور الذي ينشر أسعاره مباشرة بلا اعتماد أي جهة
      remind: true,             // تذكير بريدي للمسؤولين لو لم تُنشر أسعار اليوم
      remindHour: 11,           // الساعة (بتوقيت القاهرة) التي يبدأ بعدها التذكير
      staleDays: 1,             // أقصى عمر للأسعار قبل أن تُعتبر قديمة (بالأيام)
      historyDays: 14,          // عدد أيام السجل الظاهر للتاجر
      maxJumpPct: 20,           // تغيّر أكبر من هذه النسبة عن آخر سعر يحتاج تأكيدًا قبل النشر
      backup: '',               // ناشرون بدلاء: أكواد موظفين (S-05) أو أرقام موبايل مفصولة بفاصلة، يستطيعون النشر مهما كان دورهم
      approval: 'jump',         // jump = اعتماد ثانٍ عند القفزة الكبيرة فقط | always = كل نشر | off = تأكيد من الناشر نفسه فقط
      approveRole: 'supervisor',// أقل دور يستطيع اعتماد الأسعار المعلّقة (من غير الناشر نفسه)
      selfApprove: false,       // true = يستطيع المعتمد اعتماد طلبه بنفسه (يُسمح تلقائيًا لو لا يوجد معتمد آخر)
      approveRemindMin: 60,     // بعد كم دقيقة يُذكَّر المعتمدون بطلب معلّق
      escalate: true,           // تذكير ثانٍ للمديرين لو لم تُنشر الأسعار حتى ساعة التصعيد
      escalateHour: 13,         // ساعة التصعيد (بتوقيت القاهرة)، وتكون بعد ساعة التذكير الأول
      company: 'كايرو ثري ايه',
      disclaimer: 'الأسعار دي أسعار بيع كايرو ثري ايه المعلنة لليوم. أي منتج مش مكتوب هنا اسأل عنه الأول، والسعر النهائي بيتأكد وقت الصفقة.'
    },
    welcome: {              // رسالة الترحيب والتقدير التي تظهر للتاجر عند فتح التطبيق
      on: true,                 // false لإيقافها
      message: '',              // نص واحد يُظهَر دائمًا بدل الجمل أدناه إن كتبته ({name} = اسم التاجر الأول)
      sign: 'شركة كايرو ثري ايه · إدارة الأمن الحيوي',
      /* جمل التقدير الجاهزة (t1..t8): تتبدل يوميًا وتثبت طوال اليوم لنفس التاجر. امسح الخلية في Config لحذف جملة. */
      t1: 'شراكتك معانا بتفرق. التزامك بالأمن الحيوي بيحمي مزرعتك ومزارعنا، وإحنا بنقدّر ده جدًا.',
      t2: 'نجاحنا من نجاحك. وجودك شريك في الحملة بيخلّي سلسلة الإنتاج كلها أمان.',
      t3: 'الشركة بتقدّر وقتك وتعبك. كل خطوة التزام منك بتحمي الطيور وبتحمي رزقك.',
      t4: 'إحنا فخورين إنك معانا. أي ملاحظة أو مشكلة ابعتها من «كلّمنا» وبتوصل لمسؤولين بيتابعوها.',
      t5: 'تقديرنا ليك مش كلام: نقاطك ورتبتك بتتحسب على التزامك الفعلي، ومكافآتك بتستحقها بجهدك.',
      t6: 'كل تاجر شريك عندنا مهم. شكرًا إنك بتاخد الأمن الحيوي بجدية.',
      t7: 'التزامك بخطوات الأمن الحيوي بيطمّنّا عليك وعلى زباينك وعلى كل اللي شغالين معاك، وده بنشكرك عليه.',
      t8: 'شكرًا إنك بتخلّي الأمن الحيوي عادة يومية. فرق صغير منك كل يوم بيعمل فرق كبير لينا كلنا.'
    },
    report: {               // التقرير الأسبوعي للإدارة بالبريد (آخر 7 أيام مقارنة بالسابقة)
      on: true,
      day: 0,                   // يوم الإرسال: 0 الأحد، 1 الاثنين … 6 السبت
      hour: 8,                  // الساعة (بتوقيت القاهرة) التي يُرسَل بعدها
      minRole: 'manager',       // أقل دور يصله التقرير: supervisor | manager | admin
      extraEmails: ''           // بريد إضافي (مثلًا الإدارة العليا) مفصول بفاصلة
    },
    homescreen: {           // بطاقة «ثبّت التطبيق على شاشتك» في تبويب اليوم
      on: true,
      snoozeDays: 14            // بعد كم يوم تعود البطاقة لو أجّلها التاجر
    },
    milestones: {           // لافتة التهنئة بالمحطات داخل نافذة الترحيب. {name} {rank} {n} {period}
      on: true,
      rank: 'مبروك يا {name}! وصلت لرتبة «{rank}». ده بجهدك وانتظامك، والشركة فخورة بيك.',
      gw1: 'مبروك يا {name}! حققت أول هدف أسبوعي ليك. بداية قوية وإحنا بنقدّرها.',
      gw: 'مبروك يا {name}! حققت هدف الأسبوع {n} مرة. التزامك مصدر فخر لينا.',
      clean: 'تسلم إيدك يا {name}! {n} زيارات نظيفة عند البوابة. ده التزام بيحمي الطيور وبيحمي رزقك.',
      since: 'بقالك {period} معانا يا {name}. شكرًا على الشراكة والثقة، وإحنا فخورين بيك.'
    },
    certificate: {          // شهادة التقدير الرقمية التي يحفظها التاجر ويشاركها
      on: true,
      title: 'شهادة تقدير',
      issuer: 'شركة كايرو ثري ايه · إدارة الأمن الحيوي',
      body: 'تقديرًا للالتزام بالأمن الحيوي والحرص على حماية الطيور والشراكة الفعلية مع الشركة.',
      signer: '',               // اسم الموقِّع (اختياري، يظهر أسفل الشهادة)
      signerTitle: ''           // مسماه الوظيفي (اختياري)
    },
    voice: { on: true }     // زر «اسمع الأسعار» (نسخة صوتية عبر صوت الجهاز العربي)
  };

  /* ---------- الرتب ---------- */
  var RANKS = [
    { n: 0, name: 'شريك جديد',   need: 'تبدأ بها فور التسجيل', perk: '' },
    { n: 1, name: 'شريك واعٍ',    need: 'فيديو الإطلاق + توقيع الميثاق + أول اختبار', perk: 'شارة وكود QR' },
    { n: 2, name: 'شريك منتظم',   need: 'أسبوعان هدف محقق + زيارة بوابة نظيفة واحدة', perk: 'اسمك في لوحة شرف الشهر (بإذنك)' },
    { n: 3, name: 'شريك موثوق',   need: '4 أسابيع هدف + 3 زيارات نظيفة متتالية + 500 نقطة', perk: 'دور سريع عند البوابة' },
    { n: 4, name: 'سفير جديد',    need: '6 أشهر التزام كامل بلا مخالفة موثّقة', perk: 'بطاقة سفير + أولوية دخول' },
    { n: 5, name: 'سفير معتمد',   need: '12 شهرًا التزام متواصل', perk: 'موعد تحميل مجدول وإحاطات نصف سنوية' },
    { n: 6, name: 'سفير النخبة',  need: '24 شهرًا + ترشيح تجار جدد', perk: 'مجلس السفراء وتكريم سنوي ومحتوى حصري' }
  ];

  /* ---------- الأيقونات الأربع = فحص البوابة ---------- */
  var GATE_ITEMS = [
    { id: 'hands',    icon: 'icon1', title: 'الأيادي',   ok: 'غسل ومطهّر الأيدي',            bad: 'أيادٍ غير مغسولة',     critical: false },
    { id: 'disinfect',icon: 'icon2', title: 'التطهير',   ok: 'المرور بنقاط التطهير كاملة',    bad: 'تجاهل التطهير',         critical: false },
    { id: 'vehicle',  icon: 'icon3', title: 'العربية',   ok: 'عربية نظيفة ومطهّرة قبل الدخول', bad: 'عربية ملوثة',          critical: true },
    { id: 'shoes',    icon: 'icon4', title: 'الحذاء',    ok: 'حذاء نظيف ومطهّر / حوض القدم',  bad: 'حذاء ملوث',            critical: false }
  ];

  /* ---------- الفيديوهات (روابط Drive تُملأ من ورقة Content) ---------- */
  var VIDEOS = [
    { id: 'launch', title: 'العدو غير المرئي', desc: 'فيديو إطلاق الحملة: فيه عدو… مابيتشافش.', cover: 'cv_shoe', secs: 55, minSec: 45, order: 1, required: true },
    { id: 'virus',  title: 'رحلة الفيروس', desc: 'الفيروس بيمشي معاك من البوابة لحد العنبر… وإنت اللي بتقفل الطريق.', cover: 'cv_wash', secs: 90, minSec: 70, order: 2 },
    { id: 'spot',   title: 'اكتشف الخطأ', desc: 'مشهد من المزرعة… فين الغلط؟ اكتشفه واكسب الجولة.', cover: 'cv_spot', secs: 80, minSec: 60, order: 3 },
    { id: 'tf',     title: 'صح ولا غلط؟', desc: 'اثنا عشر كلامًا بيتقال في المزارع… إيه الصح وإيه الإشاعة؟', cover: 'cv_tf', secs: 182, minSec: 120, order: 4 },
    { id: 'defend', title: 'احمِ العنبر', desc: 'ست هجمات للفيروس من ست طرق… اقفلها كلها.', cover: 'cv_defend', secs: 188, minSec: 120, order: 5 }
  ];

  /* ---------- بطاقات «ليه بنعمل كده؟» ---------- */
  var CARDS = [
    { id: 'c1', tag: 'العربيات', title: 'العربية تتنضف وتتطهر قبل ما تدخل',
      fact: 'إرشادات هابرد: المركبات لازم تتنضف قبل دخول المزرعة، وممنوع دخول أي مركبة غير مصرح بها. وفي دليل كايرو 3A حوض/رشاش التطهير بند حرج.',
      why: 'العجل بيشيل الزرق والطين، والفيروس بيتنقل عليهم.', src: 'Hubbard Biosecurity Guidelines', url: 'https://www.hubbardbreeders.com/library?pdf=9323', forTrader: true },
    { id: 'c2', tag: 'الأقفاص', title: 'أقفاصك ماتدخلش غير لما تتغسل وتتطهر',
      fact: 'قائمة USDA للأمن الحيوي: الأدوات والمعدات اللي بتدخل المزرعة، ومعدات النقل (عربيات اليد واللوادر والرامبات)، لازم تتنضف وتتطهر كويس قبل الاستخدام. ودراسة ميدانية فرنسية (H5N8، 2017) تناولت غسيل وتطهير أقفاص وعربيات نقل البط.',
      why: 'الزرق والريش اللي على الأقفاص ممكن يجيبوا فيروس من مزرعة تانية.', src: 'USDA APHIS — HPAI Biosecurity Checklist', url: 'https://www.aphis.usda.gov/sites/default/files/HPAIchecklist.pdf', forTrader: true },
    { id: 'c3', tag: 'الأعلاف', title: 'الأعلاف والغاز بتفضل بره السور',
      fact: 'إرشادات هابرد: تأكد إن كل توريدات العلف والغاز بتفضل خارج سور المزرعة.',
      why: 'كل عربية بتعدّي السور بتفتح طريق جديد للفيروس.', src: 'Hubbard Biosecurity Guidelines', url: 'https://www.hubbardbreeders.com/library?pdf=9323', forTrader: true },
    { id: 'c4', tag: 'الحذاء', title: 'البوت الوسخ بينقل العدوى',
      fact: 'USDA: الناس ممكن تنقل الفيروس من غير قصد على بوت الشغل والهدوم والمعدات والمركبات اللي ماتنضفتش وماتطهرتش كويس.',
      why: 'العدوى ممكن تدخل العنبر في طبقة طين على الجزمة.', src: 'USDA APHIS — How to Protect Your Flock', url: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/defend-the-flock/resources/how-protect-your-flock-avian-influenza', forTrader: true },
    { id: 'c5', tag: 'حوض القدم', title: 'حوض القدم للتطهير… مش للتنضيف',
      fact: 'جامعة ديلاوير: أحواض القدم للتطهير وليست للتنضيف، واكشط الطين والزرق من البوت قبل ما تقف في الحوض.',
      why: 'المطهر مايشتغلش على بوت مغطى بطين.', src: 'University of Delaware — Footwear', url: 'https://www.udel.edu/academics/colleges/canr/cooperative-extension/fact-sheets/poultry-biosecurity-footwear/' },
    { id: 'c6', tag: 'المطهر', title: 'تركيز المطهر الأعلى مش دايمًا الأحسن',
      fact: 'جامعة ولاية أوهايو: لازم تتبع تعليمات العبوة بالظبط، وزيادة التركيز بتخلي المطهر مكلف أو كاوي.',
      why: 'الجرعة الصح ووقت التلامس الصح هما اللي بيقتلوا الفيروس.', src: 'Ohio State — Disinfection in On-Farm Biosecurity', url: 'https://ohioline.osu.edu/factsheet/vme-8' },
    { id: 'c7', tag: 'الشتا', title: 'الفيروس بيعيش أطول في البرد',
      fact: 'الوكالة الكندية CFIA: الفيروس بيعيش حوالي 7 أيام في الزرق على 20 درجة، وحوالي 60 يومًا على 4 درجات.',
      why: 'الشتا مش بيقتل الفيروس، بالعكس بيخليه يستنى أطول.', src: 'CFIA — Survival time of avian influenza viruses', url: 'https://inspection.canada.ca/en/animal-health/terrestrial-animals/diseases/reportable/avian-influenza/survival-time-avian-influenza-viruses' },
    { id: 'c8', tag: 'الزوار', title: 'ماتخالطش طيور قبل ما تزور مزرعة',
      fact: 'دليل Cobb: مفيش مخالطة للطيور لمدة 72 ساعة قبل دخول المزرعة. وإرشادات هابرد: الزيارة تتسجل، والدخول على مراحل مع تغيير الهدوم.',
      why: 'طيور السوق والبيت ممكن تشيل فيروس من غير أعراض.', src: 'Cobb — Biosecurity on the farm', url: 'https://www.thepoultrysite.com/articles/cobb-breeder-management-guide-biosecurity-on-the-farm', forTrader: true },
    { id: 'c9', tag: 'الراحة', title: 'فترة الراحة بعد التطهير لازم تتكمّل',
      fact: 'إرشادات هابرد: فترة راحة 10 أيام على الأقل بعد التنضيف والتطهير.',
      why: 'الراحة الكاملة بتقلل الأمراض في الدورة الجاية.', src: 'Hubbard Biosecurity Guidelines', url: 'https://www.hubbardbreeders.com/library?pdf=9323' },
    { id: 'c10', tag: 'السجل', title: 'سجّل كل زيارة',
      fact: 'إرشادات هابرد: «Keep a record» — سجل الزائرين والتوريد بيساعد يتتبع أي مشكلة لو حصلت.',
      why: 'التسجيل مش روتين… ده اللي بيقصّر وقت الوصول للمصدر.', src: 'Hubbard Biosecurity Guidelines', url: 'https://www.hubbardbreeders.com/library?pdf=9323', forTrader: true }
  ];

  /* ---------- الألعاب (المفاتيح على الخادم فقط) ---------- */
  var S_HUB = { label: 'Hubbard Biosecurity Guidelines', url: 'https://www.hubbardbreeders.com/library?pdf=9323' };
  var GAMES = {
    tf: {
      id: 'tf', title: 'صح ولا غلط؟', tag: 'الحلقة 4', cover: 'cv_tf', per: 6, secs: 8, kind: 'tf',
      intro: 'كل كارت بيبدأ بـ «سمعت إن…» — قرر في ثواني: صح ولا غلط؟',
      items: [
        { id: 't1', q: 'إنفلونزا الطيور بتتعالج بالمضاد الحيوي.', a: false, why: 'المضادات الحيوية مابتأثرش على الفيروسات (CDC).', src: { label: 'CDC — Antibiotic Use', url: 'https://www.cdc.gov/antibiotic-use/about/index.html' } },
        { id: 't2', q: 'الفيروس ممكن يتنقل على البوت والهدوم وعجل العربيات.', a: true, why: 'USDA: الناس بتنقله من غير قصد على البوت والهدوم والمعدات والمركبات اللي ماتطهرتش.', src: { label: 'USDA APHIS', url: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/defend-the-flock/resources/how-protect-your-flock-avian-influenza' } },
        { id: 't3', q: 'أكل الفراخ والبيض المطبوخين كويس آمن.', a: true, why: 'منظمة الصحة العالمية: مفيش دليل على انتقال الفيروس عن طريق دواجن أو بيض متحضّرين ومطبوخين كويس.', src: { label: 'WHO — Influenza (avian)', url: 'https://www.who.int/en/news-room/fact-sheets/detail/influenza-(avian-and-other-zoonotic)' } },
        { id: 't4', q: 'لو الفراخ شكلها سليمة يبقى العنبر مفيهوش عدوى.', a: false, why: 'من العلامات «نفوق مفاجئ من غير أعراض»، والبط ممكن يكون مصاب ومش باين عليه.', src: { label: 'USDA APHIS — Signs of Illness', url: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/defend-the-flock/signs-illness' } },
        { id: 't5', q: 'التطعيم لوحده كفاية حتى لو الأمن الحيوي ضعيف.', a: false, why: 'المنظمة العالمية لصحة الحيوان: التطعيم لوحده مش حل مستدام، لازم يكون جزء من استراتيجية كاملة مع الأمن الحيوي.', src: { label: 'WOAH — Avian Influenza', url: 'https://www.woah.org/en/disease/avian-influenza/' } },
        { id: 't6', q: 'الفيروس ممكن يدخل العنبر مع علف أو مية اتلوثوا بزرق طيور.', a: true, why: 'WOAH: الفيروس بيطلع في الزرق وبيتنقل عن طريق العلف والمية الملوثة.', src: { label: 'WOAH — Avian Influenza', url: 'https://www.woah.org/en/disease/avian-influenza/' } },
        { id: 't7', q: 'الفيروس بيموت بسرعة في البرد والشتا.', a: false, why: 'بيعيش حوالي 7 أيام في الزرق على 20 درجة، وحوالي 60 يومًا على 4 درجات (CFIA).', src: { label: 'CFIA — Survival time', url: 'https://inspection.canada.ca/en/animal-health/terrestrial-animals/diseases/reportable/avian-influenza/survival-time-avian-influenza-viruses' } },
        { id: 't8', q: 'إنفلونزا الطيور ممكن تعدي الإنسان.', a: true, why: 'WHO وCDC: ممكن، والنصيحة تجنّب لمس الطيور العيانة أو النافقة واستخدام وسائل الحماية.', src: { label: 'WHO — Influenza (avian)', url: 'https://www.who.int/en/news-room/fact-sheets/detail/influenza-(avian-and-other-zoonotic)' } },
        { id: 't9', q: 'فترة الراحة بعد التنضيف والتطهير بتقلل الأمراض في الدورة الجاية.', a: true, why: 'إرشادات هابرد: راحة 10 أيام على الأقل بعد التنضيف والتطهير.', src: S_HUB },
        { id: 't10', q: 'المطهر كل ما يكون مركّز أكتر يبقى أحسن.', a: false, why: 'لازم تتبع تعليمات العبوة بالظبط، وزيادة التركيز بتخلي المطهر مكلف أو كاوي (Ohio State).', src: { label: 'Ohio State — Ohioline', url: 'https://ohioline.osu.edu/factsheet/vme-8' } },
        { id: 't11', q: 'التراب والريش اللي طالع من عنبر مصاب ممكن يشيلوا الفيروس.', a: true, why: 'دراسة PLOS One: اتلقى أثر الفيروس في عينات هوا لحد 60 متر من العنابر المصابة (ماتعزلش فيروس حي).', src: { label: 'PLOS One 2015', url: 'https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0125401' } },
        { id: 't12', q: 'دبح وأكل الفراخ العيانة أو النافقة آمن طالما هتتطبخ.', a: false, why: 'WHO: الحيوانات اللي نفقت فجأة ماتتاكلش، وتجنّب أي تلامس مع الحيوانات العيانة أو النافقة.', src: { label: 'WHO — Influenza (avian)', url: 'https://www.who.int/en/news-room/fact-sheets/detail/influenza-(avian-and-other-zoonotic)' } }
      ]
    },
    steps: {
      id: 'steps', title: 'رتّب الخطوات', tag: 'الحلقة 2', cover: 'cv_clip', per: 3, secs: 0, kind: 'order',
      intro: 'الكروت متلخبطة. رتّبها من أول خطوة لآخر خطوة.',
      items: [
        { id: 's1', t: 'غسيل الإيد', order: ['بلّ إيدك وحط صابون', 'افرك 20 ثانية (ضهر الإيد وبين الصوابع وتحت الضوافر)', 'اشطف بمية جارية', 'نشّف بفوطة نضيفة'], why: 'CDC: بلّ ← صابون ← فرك 20 ثانية على الأقل ← شطف بمية جارية ← تنشيف بفوطة نضيفة.', src: { label: 'CDC — About Handwashing', url: 'https://www.cdc.gov/clean-hands/about/index.html' } },
        { id: 's2', t: 'حوض القدم', order: ['اكشط الطين والزرق بفرشة البوت', 'اشطف البوت بالمية', 'اقف في الحوض الوقت المكتوب على المطهر', 'طهّر إيدك وادخل'], why: 'الحوض للتطهير مش للتنضيف: الطين لازم يتشال الأول (جامعة ديلاوير وOMAFRA).', src: { label: 'University of Delaware', url: 'https://www.udel.edu/academics/colleges/canr/cooperative-extension/fact-sheets/poultry-biosecurity-footwear/' } },
        { id: 's3', t: 'النافق', order: ['اجمع النافق كل يوم بجوانتي', 'حطه في جردل بغطا محكم', 'خزّنه في فريزر النافق بعيد عن العنابر', 'طهّر الجردل واغسل إيدك'], why: 'النافق يتجمع يوميًا ويتخزن مقفول بعيد عن أماكن الإنتاج (UGA وOMAFRA وهابرد).', src: { label: 'UGA — Biosecurity Basics (B1306)', url: 'https://fieldreport.caes.uga.edu/publications/B1306/biosecurity-basics-for-poultry-growers/' } },
        { id: 's4', t: 'زيارة العنابر', order: ['عنبر الكتاكيت (7 أيام)', 'عنبر 21 يوم', 'عنبر 35 يوم', 'العنبر اللي فيه طيور عيانة'], why: 'الزيارة دايمًا من الأصغر للأكبر ومن السليم للعيان (OMAFRA وCobb).', src: { label: 'Ontario — Biosecurity recommendations', url: 'https://www.ontario.ca/page/biosecurity-recommendations-commercial-poultry-flocks-ontario' } },
        { id: 's5', t: 'محلول المطهر', order: ['اقرا التعليمات (الجرعة ووقت التلامس)', 'البس الجوانتي والنضارة', 'حط المية في الجردل الأول', 'ضيف المطهر بالمكيال وقلّب'], why: 'اقرا العبوة الأول، والبس الحماية، والمادة المركّزة بتتضاف على المية مش العكس.', src: { label: 'Ohio State — Disinfection', url: 'https://ohioline.osu.edu/factsheet/vme-8' } },
        { id: 's6', t: 'قلع لبس الحماية', order: ['اشطف البوت واقلعه', 'اقلع الأوفرول واقلبه لجوّه', 'اقلع النضارة من الأستك', 'اقلع الكمامة من الأستك', 'اقلع الجوانتي واغسل إيدك 20 ثانية'], why: 'CDC: البوت (بعد شطفه) ← الأوفرول ← النضارة ← الكمامة ← الجوانتي ← غسيل الإيد 20 ثانية.', src: { label: 'CDC — Remove PPE Safely', url: 'https://www.cdc.gov/bird-flu/media/pdfs/2024/09/H5-Remove-personal-protective-equipment-safely-09192024-FINAL-CLEAN.pdf' } }
      ]
    },
    shoes: {
      id: 'shoes', title: 'لو كنت مكانه؟', tag: 'الحلقة 3', cover: 'cv_gate', per: 6, secs: 10, kind: 'choice',
      intro: 'سعيد عامل في مزرعة… ومواقف حقيقية بتقابله. لو كنت مكانه هتعمل إيه؟',
      items: [
        { id: 'h1', q: 'سعيد لقى حمامة ميتة جنب بيت العنابر. يعمل إيه؟', opts: ['يمسكها بإيده ويرميها بره السور', 'يلبس جوانتي ويحطها في كيس ويقفله عليها، ويبلّغ المشرف', 'يدفنها جنب العنبر ويكمل شغله'], a: 1, wrong: 'الفيروس ينتقل على إيده وهدومه لجوه العنبر.', why: 'CDC: الطيور الميتة ماتتلمسش بالإيد — استخدم جوانتي أو كيس مقلوب.', src: { label: 'CDC — Preventing Bird Flu', url: 'https://www.cdc.gov/bird-flu/prevention/index.html' } },
        { id: 'h2', q: 'فجأة نفق عدد كبير من الفراخ في عنبر في يوم واحد. سعيد يعمل إيه؟', opts: ['يستنى للصبح يشوف هتزيد ولا لأ', 'يشيل النافق بسرعة ويرميه بعيد من غير ما يقول لحد', 'يبلّغ المشرف والدكتور فورًا، ومفيش حاجة تطلع من العنبر'], a: 2, wrong: 'العدوى تسبقه للعنابر التانية والمزارع اللي حواليه.', why: 'USDA: «نفوق مفاجئ من غير أعراض» من علامات إنفلونزا الطيور، والإبلاغ يكون فورًا.', src: { label: 'USDA APHIS — Signs of Illness', url: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/defend-the-flock/signs-illness' } },
        { id: 'h3', q: 'جاره عرض عليه كتاكيت يربيها في بيته. يعمل إيه؟', opts: ['يعتذر: اللي شغال في مزرعة مايربيش طيور في بيته', 'ياخدها ويربيها بعيد عن مكان نومه', 'ياخدها بس يغيّر هدومه قبل ما يدخل المزرعة'], a: 0, wrong: 'أي عدوى تجيل طيور البيت من الطيور البرية أو السوق هتيجي معاه المزرعة كل يوم.', why: 'قائمة USDA: سياسة المزرعة إن العاملين مايربّوش طيور تانية.', src: { label: 'USDA — HPAI Biosecurity Checklist', url: 'https://www.aphis.usda.gov/sites/default/files/HPAIchecklist.pdf' } },
        { id: 'h4', q: 'سعيد حاسس بسخونية وكحة واحمرار في عينه بعد شغل مع الطيور. يعمل إيه؟', opts: ['يقول للمشرف ويروح للدكتور، ويقوله إنه بيشتغل مع طيور', 'ياخد حاجة للسخونية ويكمل شغله عادي', 'يفضل في البيت ومايقولش لحد'], a: 0, wrong: 'المرض ممكن يتأخر اكتشافه — عنده وعند اللي حواليه.', why: 'CDC: لو ظهرت أعراض أثناء الشغل مع طيور مصابة أو مشتبه فيها، قول للمشرف ومقدم الرعاية الصحية.', src: { label: 'CDC — Information for Workers', url: 'https://www.cdc.gov/bird-flu/worker-safety/farm-workers.html' } },
        { id: 'h5', q: 'التاجر وصل بأقفاصه وعاوز يدخلها العنبر. يعمل إيه؟', opts: ['تدخل لأن التاجر معاه تصريح', 'تدخل بس ينفض الريش منها الأول', 'الأقفاص ماتدخلش غير لما تتغسل وتتطهر كويس'], a: 2, wrong: 'الزرق والريش اللي على الأقفاص ممكن يجيبوا فيروس من مزرعة تانية.', why: 'قائمة USDA: الأدوات ومعدات النقل (عربيات اليد واللوادر والرامبات) تتنضف وتتطهر كويس قبل الاستخدام.', src: { label: 'USDA — HPAI Biosecurity Checklist', url: 'https://www.aphis.usda.gov/sites/default/files/HPAIchecklist.pdf' } },
        { id: 'h6', q: 'سعيد عدّى خط الفصل ونسي حاجة في الاستراحة. يعمل إيه؟', opts: ['يعدّي ثواني ويرجع بسرعة', 'يكلّم زميل جوه يقفله، أو يرجع بخطوات الدخول كاملة', 'يعدّي بس يمسح جزمته بالأرض'], a: 1, wrong: 'كل خطوات الدخول اللي اتعملت النهارده تضيع في دقيقة.', why: 'خط الفصل: قبل العبور تقلع لبس وجزمة الشارع وتنضف إيدك، وبعده تلبس لبس وجزمة المكان — في كل مرة.', src: { label: 'Healthy Farms — Line of Separation', url: 'https://www.healthyagriculture.org/prevent/traffic-control/line-of-separation/' } }
      ]
    },
    defend: {
      id: 'defend', title: 'احمِ العنبر', tag: 'الحلقة 1', cover: 'cv_defend', per: 6, secs: 8, kind: 'choice',
      intro: 'الفيروس بيهجم على العنبر من ست طرق. كل إجابة صح بتبني درع. عندك ثواني!',
      items: [
        { id: 'd1', tag: 'هجمة من ناحية العربيات', q: 'عربية علف وصلت بوابة المزرعة. إزاي نقفل طريق الفيروس؟', opts: ['تدخل على طول لحد باب العنبر — الحمولة مستعجلة', 'تعدّي في حوض العجل وقوس الرش، وتفضل بره منطقة العنابر', 'السواق ينفض الطين بإيده وتدخل'], a: 1, why: 'هابرد: العربيات تتنضف قبل دخول المزرعة، ومفيش مركبة غير مصرح بها.', src: S_HUB },
        { id: 'd2', tag: 'هجمة من ناحية العمال', q: 'عامل جاي الشغل الصبح. إيه الطريق الصح لحد العنبر؟', opts: ['يدخل على طول بهدومه', 'يلبس بوت المزرعة بس ويدخل', 'حوض القدم ← مطهر الإيد ← شاور ← لبس وبوت المزرعة'], a: 2, why: 'هابرد: الدخول على مراحل مع تغيير الهدوم والبوت. وThe Poultry Site: حوض القدم ومطهر الإيد قبل ملامسة الطيور.', src: S_HUB },
        { id: 'd3', tag: 'هجمة من ناحية الطيور البرية', q: 'عصافير وحمام برّي بيقرّبوا من العنبر. نعمل إيه؟', opts: ['تصليح الشبك وقفل أي فتحة، ومفيش أكل ولا مية مكشوفة حوالين العنبر', 'نسيب الأكل المدلوق للعصافير تاكله بعيد عن الباب', 'نطردها بالصوت وبس'], a: 0, why: 'هابرد: منع الطيور البرية. وMSU: العلف المدلوق بيتشال ومانحطّش أكل للطيور البرية جنب المزرعة.', src: S_HUB },
        { id: 'd4', tag: 'هجمة من ناحية الفيران', q: 'علامات فيران حوالين العنبر. الحل؟', opts: ['نسيب قطة تتجول في العنابر تصطادهم', 'محطات طُعم ثابتة حوالين العنبر، وتنضيف العلف المدلوق والحشايش', 'نسيب العلف المدلوق والحشايش طالما فيه طُعم'], a: 1, why: 'هابرد: طُعم منتظم للقوارض. وMSU: شريط نضيف حوالين العنبر. وThe Poultry Site: ممنوع دخول الحيوانات الأليفة العنابر.', src: S_HUB },
        { id: 'd5', tag: 'هجمة من ناحية المية', q: 'خزان المية بتاع العنابر. إزاي نحميه؟', opts: ['غطا محكم للخزان، ومية من مصدر نضيف ومتعالجة بالكلور', 'نسيب الخزان مفتوح عشان التهوية', 'نغيّر المية كل أسبوع بس من غير كلور'], a: 0, why: 'ولاية ميسيسيبي: مفيش طيور برية أو فيران توصل لمية الشرب. وهابرد: الكلور حوالي 1 ppm في آخر الخط، والمقبول 0.5–3 ppm.', src: { label: 'Hubbard — Water Quality', url: 'https://www.hubbardbreeders.com/library?pdf=4003' } },
        { id: 'd6', tag: 'هجمة من ناحية الزوار', q: 'زائر وصل البوابة وعاوز يدخل. إيه الصح؟', opts: ['يدخل لو معاه تصريح من حد من الإدارة', 'يدخل بس يطهّر إيده', 'تسجيل، ولو خالط طيور خلال 72 ساعة مايدخلش، وإلا شاور ولبس المزرعة'], a: 2, why: 'Cobb: مفيش مخالطة للطيور 72 ساعة قبل الدخول. وهابرد: السجلات والدخول على مراحل مع تغيير الهدوم.', src: { label: 'Cobb — Biosecurity on the farm', url: 'https://www.thepoultrysite.com/articles/cobb-breeder-management-guide-biosecurity-on-the-farm' } }
      ]
    }
  };

  /* اختبارات قياس: أول مرة وبعد 30 يومًا (أسئلة مختلفة) */
  var PLACEMENT = {
    baseline: { title: 'الاختبار الأول', tf: ['t2', 't4', 't6', 't9', 't10', 't1'], shoes: ['h1', 'h2', 'h5'] },
    followup: { title: 'اختبار الشهر', tf: ['t3', 't5', 't7', 't8', 't11', 't12'], shoes: ['h3', 'h4', 'h6'] }
  };

  /* ---------- كتالوج الجوائز: بالاستحقاق لا بالسحب ---------- */
  var REWARDS = [
    { id: 'badge',   kind: 'symbolic',    title: 'شارة «شريك الدفاع»',               rank: 1, points: 0,   auto: true,  pendingOps: false, desc: 'تظهر على بطاقتك الرقمية.' },
    { id: 'cert',    kind: 'symbolic',    title: 'شهادة «حارس الأمن الحيوي» الرقمية', rank: 2, points: 0,   auto: true,  pendingOps: false, desc: 'شهادة تقدير باسمك تقدر تشاركها.' },
    { id: 'honor',   kind: 'symbolic',    title: 'اسمك في لوحة شرف الشهر',            rank: 2, points: 0,   auto: false, pendingOps: false, desc: 'بإذنك فقط. الأسماء بالترتيب الأبجدي، بدون ترتيب بالنقاط.' },
    { id: 'kit',     kind: 'gift',        title: 'مستلزمات تطهير للعربية',             rank: 2, points: 300, auto: false, pendingOps: false, desc: 'مطهّر ومرش لعربيتك.' },
    { id: 'fast',    kind: 'operational', title: 'دور سريع عند البوابة',               rank: 3, points: 0,   auto: false, pendingOps: true,  desc: 'أولوية في الدخول لو سجلك نظيف.' },
    { id: 'ppe',     kind: 'gift',        title: 'طقم حماية شخصية',                    rank: 3, points: 800, auto: false, pendingOps: false, desc: 'أوفرول وكمامة وجوانتي.' },
    { id: 'sign',    kind: 'gift',        title: 'لافتة «شريك الدفاع» للعربية',        rank: 4, points: 0,   auto: false, pendingOps: false, desc: 'تعرّف الكل إن عربيتك من شركاء الأمن الحيوي.' },
    { id: 'slot',    kind: 'operational', title: 'موعد تحميل مجدول',                   rank: 5, points: 0,   auto: false, pendingOps: true,  desc: 'موعد مضمون وإحاطات نصف سنوية.' },
    { id: 'annual',  kind: 'annual',      title: 'درع وتكريم في الملتقى السنوي',       rank: 6, points: 0,   auto: false, pendingOps: false, desc: 'تكريم سنوي لسفراء النخبة.' }
  ];

  /* ---------- منتجات الشركة التي تظهر أسعارها في «السوق النهاردة» (تُعدَّل من ورقة MarketItems) ---------- */
  var MARKET_ITEMS = [
    { id: 'broiler', name: 'فراخ التسمين الحية (سعر البيع)', short: 'فراخ حية',   unit: 'جنيه/كجم',    dec: 1, order: 1, main: 1, hidden: 0 },
    { id: 'chick',   name: 'كتكوت التسمين عمر يوم (سعر البيع)', short: 'كتكوت',   unit: 'جنيه/كتكوت',  dec: 1, order: 2, main: 0, hidden: 0 },
    { id: 'hatch',   name: 'بيض التفريخ (سعر البيع)',          short: 'بيض تفريخ', unit: 'جنيه/بيضة',   dec: 2, order: 3, main: 0, hidden: 0 },
    { id: 'table',   name: 'بيض المائدة (سعر البيع)',          short: 'بيض مائدة', unit: 'جنيه/كرتونة', dec: 0, order: 4, main: 0, hidden: 0 }
  ];

  var FARM_STATUS = {
    ready:   { label: 'جاهزة للتحميل', tone: 'good' },
    limited: { label: 'تحميل محدود',   tone: 'warn' },
    closed:  { label: 'لا تحميل اليوم', tone: 'bad' },
    unknown: { label: 'غير محدّث',     tone: 'mute' }
  };

  C.CONFIG = CONFIG;
  C.RANKS = RANKS;
  C.GATE_ITEMS = GATE_ITEMS;
  C.VIDEOS = VIDEOS;
  C.CARDS = CARDS;
  C.GAMES = GAMES;
  C.PLACEMENT = PLACEMENT;
  C.REWARDS = REWARDS;
  C.FARM_STATUS = FARM_STATUS;
  C.MARKET_ITEMS = MARKET_ITEMS;
})(C3A);
