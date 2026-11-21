// MỌI câu thoại nằm ở đây. Dùng {dish}, {table}, {amount} làm chỗ điền.

export const DIALOGUES = {
  customerEnter: [
    'Cho chỗ ngồi cái em!',
    'Quán 1 sao mà đông ghê ta…',
    'Đói muốn xỉu…',
    'Có máy lạnh không em? Không hả? Thôi kệ.',
    'Nghe nói quán này nhân viên bị tát hoài hả?',
    'Bánh mì ở đây có bảo hành không em?',
  ],
  customerWaitOrder: ['Em ơi! Có ai không?', 'Phục vụ đâu hết rồi?', 'Tui ngồi mọc rễ rồi nè!'],
  customerOrder: [
    'Cho 1 {dish}! Nhanh nha em.',
    'Lấy {dish}, ít hành nhiều pate.',
    '{dish}! Đừng cho ớt… à mà thôi cho đi.',
  ],
  customerWaitFood: [
    'Bánh mì hay bánh chưng mà lâu vậy?',
    'Đi trồng lúa mì luôn hả em?',
    'Tui kêu từ hôm qua á!',
  ],
  customerWrongDish: ['Ủa? Tui đâu có gọi món này!', 'Em đưa nhầm rồi cưng.', 'Cái này ai ăn? Không phải tui!'],
  customerEating: ['Ngon nha!', 'Măm măm…', 'Cũng được, 6 điểm.'],
  customerFinished: ['No rồi, đi trả tiền.', 'Xong! Tính tiền thôi.'],
  customerPay: ['Em ơi, tính tiền!', 'Thu tiền đi em, tui còn đi làm!', 'Bao nhiêu em?'],
  customerCounterWait: [
    'Có ai lấy tiền không vậy trời?',
    'Trả tiền mà cũng phải năn nỉ?',
    'Thu ngân đi đâu rồi? Tui về à nha!',
  ],
  customerThanks: ['Cảm ơn nha!', 'Mai ghé nữa.', 'Lần sau nhiều pate hơn nha!'],
  customerAngry: [
    'Thôi khỏi! 1 sao!',
    'Quán gì kỳ cục! Đi ăn phở!',
    'Về review cho mà coi!',
    'Đợi lâu tới mức tui già thêm 2 tuổi!',
  ],

  // --- Khách quỵt ---
  customerSneak: ['Ê, đi thôi…', 'Hí hí…', 'Tính tiền chi cho mệt…', 'Nó không để ý đâu…'],
  customerRunaway: ['Bai bai! Hí hí!', 'Chạy lẹ tụi bây!', 'Ghi nợ nha em!'],
  customerCaught: ['Ờ… quên, quên thôi mà!', 'Hì, tui tính trả mà…', 'Ủa chưa trả hả? Lạ ghê…'],
  remindAction: 'Nhắc Bàn {table} trả tiền!',
  toastRanAway: 'Bàn {table} QUỴT {amount}!',
  toastRunningAway: '🏃 Bàn {table} đang chuồn! Đuổi theo bấm E!',
  toastCaught: 'Bắt được Bàn {table}! Ra quầy thu tiền đi.',
  penaltyReasonRunaway: 'Để bàn {table} quỵt {amount}',

  // --- Chủ quán đi tuần ---
  bossSpeaker: 'Chủ quán (đứng ở quầy)',
  bossFootstep: '🩴 lẹp xẹp',
  bossMurmur: [
    'Hừm…',
    'Quán dơ quá.',
    'Điện nước tháng này cao ghê…',
    'Tụi nhỏ làm ăn sao đây?',
    'Hồi xưa tao bán một mình 100 ổ/giờ.',
    'Ai để cái ghế lệch vậy?',
  ],
  bossAuditStart: ['Đâu, đưa sổ coi…', 'Để coi sổ sách sao nè.'],
  bossCharge: ['MÀY ĐỨNG ĐÓ!', 'LẠI ĐÂY!', 'Ê THẰNG KIA!'],
  bossAfterSlap: ['Lần sau nhớ đó!', 'Làm ăn vậy đó hả?!', 'Trừ lương!'],
  bossIdle: ['Đứng đó làm tượng hả?!', 'Trả lương để mày đứng chơi hả?', 'Rảnh quá ha?'],
  bossPleased: ['Ờ, được.', 'Khá đó.'],
  angerReasonFull: 'Chủ quán bực quá nên tát cho đỡ bực',
  angerReasonIdle: 'Bị bắt quả tang đứng không',
  angerReasonAudit: 'Sổ sách lộn xộn',
  angerReasonAngry: 'Khách bỏ về',
  angerReasonRunaway: 'Để khách quỵt',
  moodNames: {
    happy: 'Vui (trúng số 50k)',
    normal: 'Bình thường',
    grumpy: 'Cáu (vừa cãi nhau với vợ)',
  },
  toastMood: 'Hôm nay chủ quán: {mood}',

  penReminder: '✏️ Nhớ ghi sổ! (N)',
  penOverdue: '✏️ CHƯA GHI SỔ!',

  auditSpeaker: 'Chủ quán (hét vọng từ nhà trong)',
  auditQuestion: [
    'Ê! Bàn {table} vừa trả bao nhiêu đó?',
    'Bàn {table} trả tiền chưa? Sổ ghi sao?',
    'Đưa sổ coi! Bàn {table} nè!',
  ],
  auditPass: ['Ừ, được. Làm tiếp đi.', 'Hừm… lần này tha.', 'Ghi đàng hoàng vậy mới được.'],
  auditFailMissing: ['Bàn {table} không ghi sổ?! Trừ lương!', 'Sổ trắng trơn vậy là sao?!'],
  auditFailWrong: ['Bàn {table} ghi sai tiền! Định ăn chặn hả?!', 'Sổ một đằng, tiền một nẻo!'],

  slap: 'BỐP!',
  penaltyReasonAuditMissing: 'Không ghi sổ bàn {table}',
  penaltyReasonAuditWrong: 'Ghi sai sổ bàn {table}',
  penaltyReasonEndShift: 'Đếm tiền cuối ca lệch sổ ({count} lỗi)',
  ratingReasonAngry: 'Bàn {table} bỏ về vì chờ lâu',
  ratingReasonCounter: 'Khách đứng quầy chờ trả tiền mỏi chân',

  toastPaid: 'Đã thu {amount} của bàn {table}. Nhớ ghi sổ!',
  toastCooked: 'Xong {dish}! Mang ra cho khách.',
  toastWritten: 'Đã ghi: Bàn {table} — {dish}',

  // --- Bảng giới thiệu ---
  intro: {
    title: 'TIỆM BÁNH MÌ ĐỊA NGỤC',
    tagline: 'Game phục vụ bánh mì gây cay cú nhất khu phố',
    story:
      'Bạn vừa được nhận vào làm phục vụ ở một tiệm bánh mì. Lương mỗi ca <b>100k</b>. ' +
      'Mỗi lần sơ suất bị trừ một ít — về <b>0k</b> là <b>bị đuổi việc</b>. ' +
      'Khách thì lầy, chủ quán thì nóng, còn bạn thì… cố lên.',
    stepsTitle: '🥖 Việc của bạn',
    steps: [
      { icon: '❗', text: 'Khách ngồi xuống → lại gần bấm <kbd>E</kbd> nhận order' },
      { icon: '🔥', text: 'Ra <b>BẾP</b> bấm <kbd>E</kbd>, đứng đó chờ bánh chín' },
      { icon: '🥖', text: 'Mang bánh tới đúng bàn, bấm <kbd>E</kbd> để đưa' },
      { icon: '💵', text: 'Khách ăn xong ra <b>QUẦY</b> → bấm <kbd>E</kbd> thu tiền' },
      { icon: '✏️', text: 'Thu xong mở sổ <kbd>N</kbd>, ghi đúng bàn + món. Chủ quán sẽ hỏi!' },
    ],
    dangersTitle: '⚠️ Hiểm họa',
    dangers: [
      {
        icon: '😤',
        name: 'Chủ quán đi tuần',
        from: 'Từ ca 2',
        text: 'Nghe "🩴 lẹp xẹp" là ổng tới. Đứng không, ghi sổ sai, để khách bỏ về → thanh bực tăng. Đầy là ăn tát.',
      },
      {
        icon: '🏃',
        name: 'Khách quỵt',
        from: 'Từ ca 3',
        text: 'Ăn xong mà ngồi liếc cửa, hiện ❓ là sắp chuồn. Đuổi theo bấm <kbd>E</kbd> trước khi nó ra khỏi cửa.',
      },
      {
        icon: '🐈',
        name: 'Con mèo của quán',
        from: 'Từ ca 4',
        text: 'Mèo vươn vai kêu "meo" là sắp dậy. Bế nó (<kbd>E</kbd>) về ổ, <b>giữ</b> <kbd>E</kbd> vuốt ve tới khi ngủ say. Để khách bế mất mèo = <b>bị đuổi</b>.',
      },
      {
        icon: '🕶️',
        name: 'Nhóm giang hồ',
        from: 'Từ ca 5',
        text: 'Đạp cửa vào, không gọi món, chỉ nhìn. Lấy <b>MENU</b> ở kệ cạnh cửa mang tới trong <b>20 giây</b>. Chậm = <b>nhập viện</b>.',
      },
      { icon: '🕵️', name: '???', from: 'Sắp có', text: 'Nghe đồn sắp có đoàn kiểm tra vệ sinh…', locked: true },
    ],
    controlsTitle: '🎮 Điều khiển',
    controls: [
      ['WASD / ←↑→↓', 'Di chuyển (theo hướng nhìn)'],
      ['Giữ chuột + kéo', 'Xoay hướng nhìn'],
      ['V', 'Đổi góc nhìn: sau lưng / mắt nhân viên'],
      ['E', 'Tương tác'],
      ['N', 'Mở / đóng sổ tay'],
      ['Esc / P', 'Tạm dừng'],
      ['M', 'Bật / tắt âm thanh'],
      ['1–4 · Z X C V · Enter', 'Trong sổ: chọn bàn, chọn món, ghi'],
    ],
    /** Hướng dẫn cho điện thoại (màn cảm ứng) */
    controlsTouch: [
      ['🕹️ Nửa trái', 'Chạm giữ rồi kéo để đi'],
      ['👆 Nửa phải', 'Vuốt để xoay hướng nhìn'],
      ['E', 'Tương tác (giữ để vuốt mèo)'],
      ['📒', 'Mở / đóng sổ tay'],
      ['👁️', 'Đổi góc nhìn'],
      ['⏸', 'Tạm dừng'],
    ],
    statsTitle: '📊 Thành tích của bạn',
    statsEmpty: 'Chưa làm ca nào. Lý lịch còn trong sạch.',
    start: 'VÀO CA {day} ▶',
    startHint: 'Enter / Space',
    restartFromOne: '↺ Chơi lại từ ca 1',
  },

  // --- Mèo ---
  catName: 'Mèo Mập',
  catZzz: '💤',
  catMeow: ['Meo~', 'Meoooo…', 'Mrrr?'],
  catStretch: '🙀 vươn vai…',
  catScratch: ['GRỪ!', 'HÍT!', 'Phì phì!'],
  catPurr: '😻 grừ grừ…',
  catHud: {
    sleeping: 'Đang ngủ',
    sleepy: 'Ngủ chập chờn',
    waking: 'SẮP DẬY!',
    wandering: 'Đi lang thang!',
    carried: 'Đang bế',
    inBed: 'Trong ổ — vuốt đi',
    grabbed: 'BỊ BẾ ĐI!!',
    stolen: 'Mất rồi…',
  },
  actionPickCat: 'Bế mèo',
  actionPutCat: 'Đặt mèo vào ổ',
  actionPetCat: 'Giữ E để vuốt ve',
  actionRescueCat: 'Giật lại mèo!',
  cantPickHandsFull: 'Tay đang cầm đồ!',
  thiefSpot: ['Ê con mèo xinh quá…', 'Mèo ai bỏ đây ta?', 'Bé mèo đi với chú nè…'],
  thiefGrab: ['Hehe, của tui rồi!', 'Về nhà với chú nha!'],
  thiefGiveUp: 'Tiếc ghê…',
  thiefCaught: ['Ủa mèo của quán hả? Tưởng mèo hoang…', 'Tui… tui bế thử thôi mà!'],
  toastCatWaking: '🐈 Mèo sắp dậy! Lại ổ giữ E vuốt ve.',
  toastCatWandering: '🐈 Mèo đi lang thang! Bế về ổ (E).',
  toastCatGrabbed: '🚨 KHÁCH BẾ MÈO ĐI! Chạy theo bấm E!',
  toastCatRescued: 'Giành lại mèo rồi! Hú hồn.',
  toastCatAsleep: '😴 Mèo ngủ say rồi.',
  penaltyReasonScratch: 'Vuốt mèo quá tay, bị cào',
  bossCatStolen: 'CON MÈO CỦA TAO ĐÂU?!',
  reasonCatStolen: 'Để khách bế mất mèo',

  // --- Giang hồ ---
  gangTableLabel: 'BÀN LỚN',
  menuLabel: 'MENU',
  actionTakeMenu: 'Lấy menu',
  actionReturnMenu: 'Để menu lại kệ',
  actionGiveMenu: 'Đưa menu cho các anh',
  actionGuessDish: 'Đoán món: đưa {dish}',
  gangEnter: ['RẦM!', 'Tránh ra!'],
  gangStare: ['…', 'Nhìn gì?', 'Hừm.', 'Tụi anh chờ hơi lâu rồi đó.'],
  gangGotMenu: ['Ờ, biết điều.', 'Được. Để anh coi.'],
  gangOrder: ['Cho anh 1 {dish}. Tụi nó nhìn thôi.', 'Lấy {dish}. Lẹ.'],
  gangGuessRight: ['…Sao mày biết? Được.', 'Ờ, trúng. Ghê.'],
  gangGuessWrong: ['Ai kêu mày đem cái này?!', 'Mày coi thường tụi anh hả?!'],
  gangWaitFood: ['Lẹ lên em.', 'Tụi anh không có kiên nhẫn đâu.'],
  gangEating: ['Măm.', 'Cũng được.'],
  gangLeave: ['Bữa nay em bao nha. Ngoan.', 'Đi tụi bây.'],
  gangAttack: ['XỬ NÓ!', 'LÊN TỤI BÂY!'],
  toastGangArrived: '🕶️ GIANG HỒ TỚI! Lấy MENU ở kệ cạnh cửa mang tới — 20 giây!',
  toastGangMenu: 'Đưa menu rồi. Làm món lẹ, mấy ảnh không kiên nhẫn.',
  toastGangLeft: 'Giang hồ đi rồi. Thở ra được rồi.',
  menuHint: '📜 Menu',

  // --- Ending (Game Over) ---
  endings: {
    fired: {
      title: 'BỊ ĐUỔI VIỆC!',
      name: 'Bị đuổi',
      comments: [
        { minTimes: 0, line: 'Lần đầu bị đuổi. Chuyện thường thôi mà.' },
        { minTimes: 3, line: 'Bị đuổi lần thứ {times}. Chủ quán bắt đầu nhớ mặt.' },
        { minTimes: 6, line: 'Lần thứ {times}. Ông chủ đã in ảnh bạn dán ở cửa.' },
        { minTimes: 10, line: 'Lần thứ {times}. Bạn giờ là huyền thoại của khu phố.' },
      ],
    },
    catLost: {
      title: 'MẤT MÈO!',
      name: 'Mất mèo',
      comments: [
        { minTimes: 0, line: 'Chủ quán ôm cái ổ mèo khóc một trận rồi đuổi bạn ra đường.' },
        { minTimes: 2, line: 'Mèo thứ {times} biến mất. Chủ quán đã lắp camera chỉ để canh bạn.' },
        { minTimes: 5, line: 'Lần thứ {times}. Cả phường dán tờ rơi "Tìm mèo — đừng thuê nhân viên này".' },
      ],
    },
    hospital: {
      title: 'NHẬP VIỆN!',
      name: 'Nhập viện',
      comments: [
        { minTimes: 0, line: 'Review quán: "Nhân viên yếu quá, 2 cú đã nằm." ⭐' },
        { minTimes: 2, line: 'Nhập viện lần {times}. Y tá đã thuộc tên bạn.' },
        { minTimes: 5, line: 'Lần thứ {times}. Bệnh viện làm thẻ thành viên VIP cho bạn.' },
      ],
    },
  },
  // --- Sự kiện ngày (mục 3.2) ---
  dayEvents: {
    rain: { name: '🌧️ Trời mưa', desc: 'Khách ít hơn nhưng ướt như chuột, cáu nhanh gấp rưỡi.' },
    holiday: { name: '🎉 Ngày lễ', desc: 'Đông nghẹt! Ai cũng vội, kiên nhẫn giảm.' },
    football: {
      name: '⚽ Đội bóng ghé ăn',
      desc: 'Đông mà dễ tính… nhưng tụi nó hay "quên" trả tiền. Canh cửa!',
    },
  },

  // --- Thẻ giới thiệu ca (trước mỗi ca, trừ khi bấm chơi lại) ---
  briefing: {
    title: 'CA {day}',
    moodLabel: 'Chủ quán hôm nay',
    noBoss: 'Chủ quán ở nhà trong, thỉnh thoảng hét ra hỏi sổ.',
    eventLabel: 'Sự kiện',
    noEvent: 'Một ngày bình thường. Nghe đáng ngờ.',
    newLabel: '🆕 Mới hôm nay',
    start: 'BẮT ĐẦU CA ▶',
    startHint: 'Enter / Space',
    mixed: 'Mọi thứ đều có thể xảy ra cùng lúc. Chúc may mắn.',
  },
  newToday: {
    1: 'Ca đầu tiên! Nhận order → làm bánh ở bếp → đưa món → thu tiền ở quầy → GHI SỔ (N). Chủ quán sẽ hét hỏi sổ đó.',
    2: 'Chủ quán bắt đầu đi tuần. Nghe "🩴 lẹp xẹp" là ổng tới — đừng đứng không, ghi sổ cho đúng. Thanh bực đầy là ăn tát.',
    3: 'Khách quỵt! Ăn xong mà ngồi liếc cửa, hiện ❓ là sắp chuồn. Chạy theo bấm E trước khi nó ra khỏi cửa.',
    4: 'Con mèo của quán! Kêu "meo" là sắp dậy. Bế về ổ, GIỮ E vuốt tới khi ngủ. Để khách bế mất mèo = bị đuổi.',
    5: 'Giang hồ! Đạp cửa vào, không gọi món. Lấy MENU ở kệ tím cạnh cửa mang tới trong 20 giây. Chậm = nhập viện.',
  },

  // --- Menu tạm dừng ---
  pause: {
    title: '⏸️ NGHỈ MỆT',
    subtitle: 'Chủ quán không thấy đâu. Tranh thủ thở.',
    resume: 'Làm tiếp',
    retry: 'Chơi lại ca này',
    sound: 'Âm thanh',
    on: 'Bật',
    off: 'Tắt',
    home: 'Về màn hình chính',
  },

  // --- Màn cuối ca ---
  review: {
    base: 'Lương gốc',
    deductions: 'Bị trừ',
    takeHome: 'Thực nhận',
    newRecord: '🏆 KỶ LỤC LƯƠNG MỚI!',
    grade: 'Xếp loại',
    reviewsTitle: '💬 Khách để lại review',
  },
  grades: [
    { min: 90, grade: 'S', line: 'Nhân viên của năm. Chủ quán nghi bạn gian lận.' },
    { min: 75, grade: 'A', line: 'Tốt! Mai được ăn ké một ổ bánh mì.' },
    { min: 55, grade: 'B', line: 'Tạm được. Chủ quán gật đầu nửa vời.' },
    { min: 35, grade: 'C', line: 'Sống sót. Chỉ vậy thôi.' },
    { min: 0, grade: 'D', line: 'Còn đi làm được là may.' },
  ],
  statReviews: {
    ranAway: ['"Ăn xong đi luôn không ai cản. 5 sao!" — khách quỵt', '"Quán dễ thương, không ai đòi tiền." ⭐⭐⭐⭐⭐'],
    angry: ['"Ngồi mốc meo không ai hỏi. 1 sao."', '"Tưởng quán đóng cửa, hóa ra nhân viên đi lạc."'],
    slaps: ['"Đang ăn thì thấy ông chủ tát nhân viên. Giải trí tốt." ⭐⭐⭐⭐', '"Có show tát trực tiếp, đáng tiền."'],
    served: ['"Bánh ra nhanh như tên lửa."', '"Nhân viên chạy như bị ma đuổi, mà ngon."'],
    perfect: ['"Quán hoàn hảo. Chắc tôi đi nhầm quán."'],
  },

  // --- Game Over theo ngữ cảnh (mục 8: chết đúng chỗ khó có câu riêng) ---
  deathContext: {
    lastSeconds: 'Còn có {sec} giây nữa là hết ca… đau hơn bị tát.',
    firstDay: 'Toang ngay ca đầu. Kỷ lục buồn của tiệm.',
    firstEver: 'Lần toang đầu tiên trong sự nghiệp. Nhớ lấy cảm giác này.',
    manyTimes: 'Đây là lần toang thứ {times}. Bạn có thấy quen không?',
  },

  // --- Nhân vật chính lẩm bẩm ---
  player: {
    penalty: ['Ủa sao lương tui bị trừ?', 'Lương tui!!', 'Ơ… tiền của tui…', 'Thôi xong tháng này ăn mì gói.'],
    slapped: ['Áuuu!', 'Má ơi!', 'Đau quá ông chủ ơi!', 'Thấy cả ông bà ông vải…'],
    ranAway: ['Ê ê! Trả tiền đã!', 'Ơ kìa!!', 'Sao chạy lẹ vậy trời!'],
    catGrabbed: ['Ê ê con mèo!!', 'Mèo của quán đó!!'],
    catScratch: ['Á! Mèo cào!', 'Thôi thôi xin lỗi bé!'],
    gangArrived: ['Chết rồi…', 'Mấy anh… mấy anh ngồi chơi ạ…', 'Menu… menu đâu rồi…'],
    auditWarning: ['Ghi rồi mà… hình như…', 'Chết, ghi chưa ta?', 'Sổ đâu sổ đâu…'],
    served: ['Mời anh chị ạ!', 'Bánh nóng hổi đây!', 'Của bàn này nha!'],
  },

  posters: ['NGON NHẤT PHƯỜNG (tự nhận)', 'CẤM NỢ — KỂ CẢ GIANG HỒ', 'MÈO KHÔNG BÁN'],
  menuBoardTitle: 'THỰC ĐƠN',

  shiftEndTitle: 'HẾT CA!',
  reviewsGood: ['"Nhân viên nhanh như ninja, 5 sao."', '"Bánh ngon, sổ sách rõ ràng. Lạ ghê."'],
  reviewsMid: ['"Ăn được. Nhân viên hơi lú."', '"Chờ hơi lâu nhưng pate ngon."'],
  reviewsBad: ['"Chờ 30 phút chưa thấy ai. 1 sao."', '"Nhân viên đi lạc trong quán của chính mình."'],

  // Điện thoại
  rotateTitle: 'Xoay ngang điện thoại đi sếp!',
  rotateText: 'Quán chật lắm, đứng dọc không vừa. Xoay ngang màn hình để làm ca tiếp.',
  touchButtons: { interact: 'E', notebook: '📒', view: '👁️', pause: '⏸' },
} as const;

export function fillLine(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(vars[key] ?? `{${key}}`));
}

export type EndingKey = keyof typeof DIALOGUES.endings;

/** Câu bình luận theo số lần đã dính ending này (mục 8: thoại theo ngữ cảnh) */
export function endingComment(ending: EndingKey, times: number): string {
  const comments = DIALOGUES.endings[ending].comments;
  let line: string = comments[0].line;
  for (const c of comments) if (times >= c.minTimes) line = c.line;
  return fillLine(line, { times });
}
