/* SAP-C02 Offline: a dependency-free, local-first quiz shell. */
(function () {
  "use strict";

  const STORAGE_KEY = "sap-c02-offline-session";
  const THEME_KEY = "sap-c02-offline-theme";
  const DATA_VERSION = "expert-aids-2";
  const app = document.getElementById("app");
  const loading = document.getElementById("loading");
  const liveRegion = document.getElementById("live-region");
  const dialog = document.getElementById("submit-dialog");
  const state = {
    catalog: [], questions: [], questionMap: new Map(), view: "home",
    session: null, lastResult: null, bankQuery: "", bankTest: "all", hasSaved: false
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHtml = (value) => String(value == null ? "" : value)
    .replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const announce = (text) => { liveRegion.textContent = text; };
  const catalogTitle = (id) => (state.catalog.find((item) => item.id === id) || {}).title || id;
  const questionKey = (question) => question && question.id;
  const currentQuestion = () => state.session && state.questionMap.get(state.session.questions[state.session.current]);
  const answersFor = (id) => (state.session.answers[id] || []);
  const isUnavailable = (question) => !question.correctAnswers || question.correctAnswers.length === 0;
  const sameSet = (a, b) => a.length === b.length && a.every((item) => b.includes(item));
  const isCorrect = (question, answers) => !isUnavailable(question) && sameSet(answers, question.correctAnswers);

  function persist() {
    if (!state.session) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.session)); } catch (_) { /* private mode */ }
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    const label = theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối";
    $$("#theme-toggle, #mobile-theme-toggle").forEach((button) => { button.setAttribute("aria-label", label); });
  }

  function toggleTheme() {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  }

  async function loadData() {
    try {
      const catalogResponse = await fetch("data/catalog.json?v=" + DATA_VERSION);
      if (!catalogResponse.ok) throw new Error("Không thể tải catalog.json");
      state.catalog = await catalogResponse.json();
      const records = await Promise.all(state.catalog.map(async (item) => {
        const response = await fetch("data/" + encodeURIComponent(item.id) + ".json?v=" + DATA_VERSION);
        if (!response.ok) throw new Error("Không thể tải " + item.id + ".json");
        return response.json();
      }));
      state.questions = records.flat().map((question) => ({
        ...question,
        options: Array.isArray(question.options) ? question.options : [],
        correctAnswers: Array.isArray(question.correctAnswers) ? question.correctAnswers : []
      }));
      state.questionMap = new Map(state.questions.map((question) => [question.id, question]));
      loading.hidden = true;
      app.hidden = false;
      detectSavedSession();
      render();
    } catch (error) {
      loading.innerHTML = '<div class="error-state"><p class="eyebrow">Không thể tải dữ liệu</p><h1>Chưa thể mở bộ câu hỏi</h1><p class="muted">' +
        escapeHtml(error.message) + '. Hãy chạy ứng dụng qua máy chủ HTTP (ví dụ: <code>python3 -m http.server</code>) rồi thử lại.</p></div>';
    }
  }

  function detectSavedSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || !Array.isArray(saved.questions) || !saved.questions.length) return;
      const valid = saved.questions.every((id) => state.questionMap.has(id));
      if (!valid || !["practice", "exam"].includes(saved.mode)) return;
      state.session = saved;
      state.view = saved.mode;
      announce("Đã khôi phục phiên làm bài của bạn.");
    } catch (_) {}
  }

  function clearSaved() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    state.hasSaved = false;
    state.savedSession = null;
    $("#restore-banner").hidden = true;
  }

  function startSession(mode) {
    const selectedTest = $("#test-select").value;
    let pool = state.questions.filter((question) => selectedTest === "all" || question.source === selectedTest);
    const requested = Number($("#question-count").value);
    if (requested > 0) pool = pool.slice(0, Math.min(requested, pool.length));
    if ($("#shuffle-questions").checked) pool = shuffle(pool);
    state.session = {
      mode, test: selectedTest, questions: pool.map(questionKey), current: 0, answers: {}, checked: {},
      flags: {}, startedAt: Date.now(), submitted: false
    };
    state.lastResult = null;
    state.view = mode;
    persist();
    render();
    announce((mode === "exam" ? "Bắt đầu thi thử. " : "Bắt đầu luyện tập. ") + "Câu 1 trên " + pool.length);
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function restoreSession() {
    state.session = state.savedSession;
    state.view = state.session.mode;
    state.hasSaved = false;
    $("#restore-banner").hidden = true;
    persist();
    render();
    announce("Đã khôi phục phiên học.");
  }

  function navigate(view) {
    if (view === "results" && !state.lastResult) {
      state.view = "home";
    } else if (["practice", "exam"].includes(view) && !state.session) {
      state.view = "home";
    } else state.view = view;
    render();
  }

  function render() {
    updateNav();
    if (state.view === "home") renderHome();
    else if (state.view === "practice" || state.view === "exam") renderQuiz();
    else if (state.view === "bank") renderBank();
    else renderResults();
  }

  function updateNav() {
    $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.nav === state.view));
  }

  function renderHome() {
    const options = state.catalog.map((item) => '<option value="' + escapeHtml(item.id) + '">' +
      escapeHtml(item.title) + " · " + item.questionCount + " câu</option>").join("");
    app.innerHTML = '<section class="page" aria-labelledby="home-title">' +
      '<div class="home-hero"><div><p class="eyebrow">Bộ ôn thi offline</p><h1 id="home-title">Chinh phục SAP-C02<br>theo nhịp của bạn.</h1><p>Không cần kết nối mạng. Luyện tập từng câu hoặc mô phỏng phòng thi với dữ liệu lưu ngay trên thiết bị.</p></div>' +
      '<div class="count-card"><strong>' + state.questions.length + '</strong><span>câu hỏi sẵn sàng</span></div></div>' +
      '<div class="home-grid"><div class="card setup-card"><p class="eyebrow">Bắt đầu phiên mới</p><h2>Chọn cách học</h2><p>Cấu hình bộ đề và số câu trước khi bắt đầu.</p>' +
      '<div class="field"><label class="field-label" for="test-select">Bộ đề</label><select id="test-select"><option value="all">Tất cả bộ đề · ' + state.questions.length + ' câu</option>' + options + '</select></div>' +
      '<div class="setup-options"><div class="field"><label class="field-label" for="question-count">Số câu (để trống = tất cả)</label><input id="question-count" type="number" min="1" max="' + state.questions.length + '" placeholder="Tất cả câu"></div>' +
      '<label class="check-control"><input id="shuffle-questions" type="checkbox"> Xáo trộn thứ tự câu hỏi</label></div>' +
      '<div class="cta-row"><button class="button secondary" id="start-practice" type="button">Luyện tập</button><button class="button primary" id="start-exam" type="button">Thi thử</button></div></div>' +
      '<div class="card feature-card"><p class="eyebrow">Trong ứng dụng</p><h2>Tập trung vào điều quan trọng</h2><ul class="feature-list"><li><span class="feature-icon">✓</span><span>Kiểm tra đáp án và đọc giải thích tiếng Việt sau mỗi câu.</span></li><li><span class="feature-icon">⌁</span><span>Thi thử không gợi ý đáp án cho đến khi bạn nộp bài.</span></li><li><span class="feature-icon">↺</span><span>Tự động lưu phiên học để bạn có thể quay lại bất cứ lúc nào.</span></li></ul></div></div></section>';
    $("#start-practice").addEventListener("click", () => startSession("practice"));
    $("#start-exam").addEventListener("click", () => startSession("exam"));
  }

  function sessionQuestionList() {
    return state.session.questions.map((id) => state.questionMap.get(id)).filter(Boolean);
  }

  function renderQuiz() {
    const question = currentQuestion();
    if (!question) { state.view = "home"; render(); return; }
    const sessionQuestions = sessionQuestionList();
    const selected = answersFor(question.id);
    const checked = Boolean(state.session.checked[question.id]);
    const exam = state.session.mode === "exam";
    const type = question.requiredAnswers > 1 ? "checkbox" : "radio";
    const options = question.options.map((option, index) => {
      const correctShown = checked && !isUnavailable(question) && question.correctAnswers.includes(option.id);
      const selectedShown = selected.includes(option.id);
      let optionClass = "option" + (selectedShown ? " selected" : "") + (correctShown ? " correct" : "");
      if (checked && selectedShown && !correctShown) optionClass += " incorrect";
      let result = "";
      if (checked && correctShown) result = '<span class="option-result">Đúng</span>';
      else if (checked && selectedShown && !correctShown) result = '<span class="option-result">Đã chọn</span>';
      return '<label class="' + optionClass + '"><input type="' + type + '" name="answer" value="' + escapeHtml(option.id) + '"' +
        (selectedShown ? " checked" : "") + (checked ? " disabled" : "") + ' aria-label="Đáp án ' + escapeHtml(option.id) + '">' +
        '<span class="option-key">' + escapeHtml(option.id || String.fromCharCode(65 + index)) + '</span><span class="option-text">' + escapeHtml(option.text) + '</span>' + result + '</label>';
    }).join("");
    const status = checked ? (isUnavailable(question) ? "unavailable" : isCorrect(question, selected) ? "right" : "wrong") : "";
    const feedback = checked ? renderFeedback(question, status) : "";
    const learningAvailable = !exam && checked;
    const learningTrigger = learningAvailable ? '<div class="learning-trigger-row"><button type="button" class="deep-learning-trigger" id="open-learning" aria-haspopup="dialog" aria-controls="learning-drawer">💡 <span>Gợi ý học sâu</span></button><span class="learning-trigger-note">Mở sau khi kiểm tra</span></div>' : "";
    const answeredCount = sessionQuestions.filter((item) => answersFor(item.id).length).length;
    const unanswered = sessionQuestions.length - answeredCount;
    const nextLabel = state.session.current === sessionQuestions.length - 1 ? "Câu đầu tiên" : "Câu tiếp theo";
    app.innerHTML = '<section class="page" aria-labelledby="quiz-title"><div class="quiz-top"><div><p class="eyebrow">' + (exam ? "Mô phỏng phòng thi" : "Luyện tập có hướng dẫn") + '</p><h1 id="quiz-title">' + escapeHtml(catalogTitle(state.session.test === "all" ? "Tất cả bộ đề" : state.session.test)) + '</h1><p>' + (exam ? unanswered + " câu chưa trả lời" : "Chọn đáp án rồi kiểm tra khi bạn sẵn sàng") + '</p></div>' + (exam ? '<button class="button primary" id="submit-exam-top" type="button">Nộp bài</button>' : '<button class="button secondary" id="exit-session" type="button">Thoát phiên</button>') + '</div>' +
       '<div class="quiz-layout"><article class="card question-card"><div class="question-meta"><span class="question-number">CÂU ' + (state.session.current + 1) + ' / ' + sessionQuestions.length + '</span><span>' + (question.requiredAnswers > 1 ? "Chọn " + question.requiredAnswers + " đáp án" : "Chọn 1 đáp án") + '</span></div><p class="question-text">' + escapeHtml(question.question) + '</p><p class="required-hint">' + (exam ? "Đáp án sẽ chỉ được chấm khi bạn nộp bài." : "Bạn có thể đổi lựa chọn trước khi kiểm tra đáp án.") + '</p><div class="options" role="group" aria-label="Các đáp án">' + options + '</div>' + feedback + learningTrigger +
      '<div class="question-actions"><button type="button" class="flag-button ' + (state.session.flags[question.id] ? "flagged" : "") + '" id="flag-question" aria-pressed="' + Boolean(state.session.flags[question.id]) + '">' + (state.session.flags[question.id] ? "⚑ Đã đánh dấu" : "⚐ Đánh dấu xem lại") + '</button><div class="action-right">' + (!exam ? '<button class="button secondary" id="check-answer" type="button" ' + (selected.length !== Number(question.requiredAnswers) || checked ? "disabled" : "") + '>Kiểm tra đáp án</button>' : "") + '<button class="button primary" id="next-question" type="button">' + nextLabel + '</button></div></div></article>' +
       '<aside class="card navigator-card"><h3>Câu hỏi <span>' + answeredCount + "/" + sessionQuestions.length + " đã chọn</span></h3>" + (exam ? '<p class="exam-status">' + unanswered + ' câu chưa trả lời · phím M để đánh dấu</p>' : "") + '<div class="nav-legend"><span><i class="legend-dot current"></i>Hiện tại</span><span><i class="legend-dot right"></i>Đúng</span><span><i class="legend-dot wrong"></i>Sai</span><span><i class="legend-dot"></i>Chưa kiểm tra</span></div><div class="navigator" aria-label="Điều hướng câu hỏi">' + renderNavigator(sessionQuestions) + '</div></aside></div></section>' + (learningAvailable ? renderLearningDrawer(question) : "");
    bindQuizEvents(question, sessionQuestions);
  }

  function renderFeedback(question, status) {
    if (status === "unavailable") return '<div class="feedback warning"><strong>Chưa có đáp án chuẩn</strong><span>Câu hỏi này hiện chưa có dữ liệu đáp án chính xác. Câu này không được tính là đúng.</span></div>';
    const correctText = question.correctAnswers.join(", ");
    const explanation = question.explanation || question.reviewNote || "Chưa có giải thích cho câu hỏi này.";
    if (status === "right") return '<div class="feedback success"><strong>Chính xác</strong><span>Đáp án đúng: ' + escapeHtml(correctText) + '</span><br><span>' + escapeHtml(explanation) + '</span></div>';
    return '<div class="feedback error"><strong>Chưa chính xác</strong><span>Đáp án đúng: ' + escapeHtml(correctText) + '</span><br><span>' + escapeHtml(explanation) + '</span></div>';
  }

  const aidText = (value, fallback) => {
    if (Array.isArray(value)) return value.length ? value.map(escapeHtml).join("") : '<span class="learning-fallback">' + fallback + "</span>";
    return value ? escapeHtml(value) : '<span class="learning-fallback">' + fallback + "</span>";
  };
  const aidList = (value, fallback) => {
    if (!Array.isArray(value) || !value.length) return '<li class="learning-fallback">' + fallback + "</li>";
    return value.map((item) => "<li>" + escapeHtml(item) + "</li>").join("");
  };
  const aidListBlock = (value, fallback) => '<ul class="learning-detail-list">' + aidList(value, fallback) + "</ul>";
  const aidParagraph = (value, fallback) => '<p>' + aidText(value, '<span class="learning-fallback">' + fallback + "</span>") + "</p>";
  const aidRows = (items, render, fallback) => Array.isArray(items) && items.length ? items.map(render).join("") : '<p class="learning-fallback">' + fallback + "</p>";
  const keywordMarkup = (items) => items.map((item) => {
    if (typeof item === "string") return "<span>" + escapeHtml(item) + "</span>";
    const term = item && item.term ? item.term : "";
    const meaning = item && item.meaning ? item.meaning : "";
    return "<span><b>" + escapeHtml(term || "Từ khóa") + "</b>" + (meaning ? "<small>" + escapeHtml(meaning) + "</small>" : "") + "</span>";
  }).join("");
  function renderLearningDrawer(question) {
    const aid = question.learningAid || {};
    const focus = aid.focusPoints || aid.focus || aid.keyPoints;
    const reasoning = Array.isArray(aid.reasoning) ? aid.reasoning : [];
    const analysis = aid.answerAnalysis || {};
    const correctAnalysis = Array.isArray(analysis.correct) ? analysis.correct : [];
    const alternatives = Array.isArray(analysis.alternatives) ? analysis.alternatives : [];
    const boundaries = Array.isArray(aid.serviceBoundaries) ? aid.serviceBoundaries : [];
    const traps = Array.isArray(aid.examTraps) ? aid.examTraps : [];
    const keywords = Array.isArray(aid.keywords) ? aid.keywords : [];
    const context = aid.context || aid.contextRequirements || {};
    const translation = aid.translation || aid.vietnamese || {};
    const real = aid.realWorld || aid.example || aid.scenario || {};
    const options = (translation.options || []).map((item) => "<li>" + escapeHtml(typeof item === "string" ? item : (item.id || "") + ". " + (item.text || "")) + "</li>").join("");
    const reasoningMarkup = reasoning.length
      ? '<div class="learning-section learning-reasoning"><h3><span>01</span> Đường suy luận</h3><ol>' + reasoning.map((item) => "<li><b>" + escapeHtml(item.observation || "Quan sát") + "</b>" + (item.inference ? "<span>" + escapeHtml(item.inference) + "</span>" : "") + "</li>").join("") + "</ol></div>"
      : '<div class="learning-section"><h3><span>01</span> Điểm cần tập trung</h3><ul>' + aidList(focus, "Chưa có điểm tập trung được cung cấp.") + "</ul></div>";
    const correctMarkup = correctAnalysis.length || analysis.combinationLogic
      ? '<div class="learning-section learning-correct"><h3><span>02</span> Vì sao đúng</h3>' + aidRows(correctAnalysis, (item) => '<p><b>' + escapeHtml(item.id || "Đáp án") + ':</b> ' + escapeHtml(item.why || "") + "</p>", "Chưa có phân tích đáp án.") + (analysis.combinationLogic ? '<p><b>Kết hợp đáp án:</b> ' + escapeHtml(analysis.combinationLogic) + "</p>" : "") + "</div>"
      : "";
    const v2Details = [
      alternatives.length ? '<details class="learning-disclosure"><summary>Vì sao các lựa chọn khác không phù hợp</summary><div>' + alternatives.map((item) => '<div class="learning-detail-card"><p><b>' + escapeHtml(item.id || "Lựa chọn") + '</b> ' + escapeHtml(item.failsBecause || "") + "</p>" + (item.whenFits ? "<p><b>Khi nào phù hợp:</b> " + escapeHtml(item.whenFits) + "</p>" : "") + "</div>").join("") + "</div></details>" : "",
      boundaries.length ? '<details class="learning-disclosure"><summary>Ranh giới dịch vụ</summary><div>' + boundaries.map((item) => '<div class="learning-detail-card"><p><b>' + escapeHtml(item.service || "Dịch vụ") + "</b></p><p><b>Dùng khi:</b> " + escapeHtml(item.useWhen || "") + "</p><p><b>Không dùng cho:</b> " + escapeHtml(item.notFor || "") + "</p></div>").join("") + "</div></details>" : "",
      traps.length ? '<details class="learning-disclosure"><summary>Bẫy thường gặp</summary><div><ul class="learning-detail-list">' + traps.map((item) => "<li><b>" + escapeHtml(item.cue || "Dấu hiệu") + ":</b> " + escapeHtml(item.avoid || "") + "</li>").join("") + "</ul></div></details>" : ""
    ].join("");
    const memoryMarkup = aid.memoryAnchor ? '<div class="learning-memory"><b>Ghi nhớ nhanh</b><span>' + escapeHtml(aid.memoryAnchor) + "</span></div>" : "";
    return '<div class="learning-scrim" id="learning-scrim" hidden></div><aside class="learning-drawer" id="learning-drawer" role="dialog" aria-modal="true" aria-labelledby="learning-title" aria-hidden="true">' +
      '<div class="learning-drawer-head"><div><p class="eyebrow">LEARNING LENS <span class="learning-checked">✓ ĐÃ KIỂM TRA</span></p><h2 id="learning-title">Tách lớp suy luận</h2></div><button type="button" class="learning-close" id="close-learning" aria-label="Đóng gợi ý học sâu">×</button></div>' +
      '<div class="learning-tabs" role="tablist" aria-label="Nội dung gợi ý học sâu"><button type="button" class="learning-tab active" id="deep-learning-tab" role="tab" aria-selected="true" aria-controls="deep-learning-panel">Phân tích học sâu</button><button type="button" class="learning-tab" id="real-learning-tab" role="tab" aria-selected="false" aria-controls="real-learning-panel">Ví dụ thực tế</button></div>' +
      '<div class="learning-scroll"><section class="learning-panel" id="deep-learning-panel" role="tabpanel" aria-labelledby="deep-learning-tab"><div class="learning-summary"><strong>' + aidText(aid.summary, "Chưa có tóm tắt học sâu cho câu hỏi này.") + '</strong><p>Đáp án và giải thích ở trên là kết quả kiểm tra của câu này; phần dưới mở rộng cách suy luận.</p></div>' + reasoningMarkup + correctMarkup + '<div class="learning-keywords">' + (keywords.length ? keywordMarkup(keywords) : '<span class="learning-fallback">Chưa có từ khóa được cung cấp.</span>') + '</div>' + memoryMarkup + (v2Details ? '<div class="learning-disclosures">' + v2Details + "</div>" : "") + '<div class="learning-section"><h3><span>' + (reasoning.length ? "03" : "02") + '</span> Bối cảnh, yêu cầu &amp; ràng buộc</h3><p><b>Bối cảnh:</b> ' + aidText(context.context || aid.context, "Chưa có bối cảnh được cung cấp.") + '</p><div class="learning-detail-field"><b>Yêu cầu:</b>' + aidListBlock(context.requirements || aid.requirements, "Chưa có yêu cầu được cung cấp.") + '</div><div class="learning-detail-field"><b>Ràng buộc:</b>' + aidListBlock(context.constraints || aid.constraints, "Chưa có ràng buộc được cung cấp.") + '</div></div><details class="learning-translation"><summary>↗ Xem bản dịch tiếng Việt của câu hỏi &amp; lựa chọn</summary><div><p><b>Câu hỏi:</b> ' + aidText(translation.stem || translation.question, "Chưa có bản dịch câu hỏi.") + '</p>' + (options ? "<p><b>Lựa chọn:</b></p><ul>" + options + "</ul>" : '<p class="learning-fallback">Chưa có bản dịch lựa chọn.</p>') + "</div></details></section>" +
      '<section class="learning-panel" id="real-learning-panel" role="tabpanel" aria-labelledby="real-learning-tab" hidden><p class="eyebrow">ARCHITECTURE FIELD NOTE</p><h3 class="learning-real-title">' + aidText(real.title || real.scenario, "Ví dụ kiến trúc thực tế") + '</h3><div class="learning-real-copy"><p><b>Tình huống:</b> ' + aidText(real.scenario, "Chưa có tình huống thực tế được cung cấp.") + '</p><p><b>Thách thức:</b> ' + aidText(real.challenge, "Chưa có thách thức thực tế được cung cấp.") + '</p><p><b>Nguyên tắc:</b> ' + aidText(real.principle, real.tradeoffs ? "" : "Chưa có nguyên tắc được cung cấp.") + '</p>' + (real.tradeoffs ? '<p><b>Trade-off:</b> ' + escapeHtml(real.tradeoffs) + "</p>" : "") + (real.recommendation ? '<p><b>Khuyến nghị:</b> ' + escapeHtml(real.recommendation) + "</p>" : "") + '</div><div class="learning-takeaway"><b>Bài học:</b> ' + aidText(real.takeaway, "Chưa có takeaway được cung cấp.") + "</div></section></div>" +
      '<div class="learning-drawer-foot"><span>Gợi ý chỉ mở sau khi kiểm tra</span><button type="button" class="button primary" id="close-learning-foot">Đóng</button></div></aside>';
  }

  function renderNavigator(questions) {
    return questions.map((question, index) => {
      const selected = answersFor(question.id).length > 0;
      const checked = state.session.checked[question.id];
      let status = checked ? (isUnavailable(question) ? " unavailable" : isCorrect(question, answersFor(question.id)) ? " right" : " wrong") : " unchecked";
      if (selected && !checked) status += " answered";
      const statusLabel = checked ? (isUnavailable(question) ? "chưa có đáp án chuẩn" : isCorrect(question, answersFor(question.id)) ? "đúng" : "sai") : selected ? "đã chọn, chưa kiểm tra" : "chưa kiểm tra";
      return '<button type="button" class="nav-question ' + status + (index === state.session.current ? " current" : "") + (state.session.flags[question.id] ? " flagged" : "") + '" data-question-index="' + index + '" aria-label="Câu ' + (index + 1) + ", " + statusLabel + '">' + (index + 1) + '</button>';
    }).join("");
  }

  function bindQuizEvents(question, questions) {
    let learningOpener = null;
    const closeLearning = () => {
      const drawer = $("#learning-drawer");
      const scrim = $("#learning-scrim");
      if (!drawer || !drawer.classList.contains("open")) return;
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      if (scrim) scrim.hidden = true;
      document.body.classList.remove("learning-open");
      if (learningOpener) learningOpener.focus();
    };
    const openLearning = () => {
      const drawer = $("#learning-drawer");
      const scrim = $("#learning-scrim");
      learningOpener = $("#open-learning");
      if (!drawer || !scrim || !learningOpener) return;
      drawer.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
      scrim.hidden = false;
      document.body.classList.add("learning-open");
      $("#close-learning")?.focus();
    };
    $("#open-learning")?.addEventListener("click", openLearning);
    $("#close-learning")?.addEventListener("click", closeLearning);
    $("#close-learning-foot")?.addEventListener("click", closeLearning);
    $("#learning-scrim")?.addEventListener("click", closeLearning);
    $$(".learning-tab").forEach((tab) => tab.addEventListener("click", () => {
      $$(".learning-tab").forEach((item) => {
        const active = item === tab;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      $$(".learning-panel").forEach((panel) => { panel.hidden = panel.id !== tab.getAttribute("aria-controls"); });
    }));
    $$(".options input").forEach((input) => input.addEventListener("change", () => {
      const values = $$(".options input:checked").map((item) => item.value);
      state.session.answers[question.id] = values;
      persist();
      renderQuiz();
      setTimeout(() => { const first = $('.options input:checked'); if (first) first.focus(); }, 0);
    }));
    $("#check-answer")?.addEventListener("click", () => {
      state.session.checked[question.id] = true;
      persist(); renderQuiz(); announce(isCorrect(question, answersFor(question.id)) ? "Đáp án chính xác." : "Đã kiểm tra đáp án.");
    });
    $("#next-question").addEventListener("click", () => {
      state.session.current = (state.session.current + 1) % questions.length;
      persist(); renderQuiz(); announce("Câu " + (state.session.current + 1) + " trên " + questions.length);
    });
    $("#flag-question").addEventListener("click", () => {
      state.session.flags[question.id] = !state.session.flags[question.id];
      persist(); renderQuiz();
    });
    $$(".nav-question").forEach((button) => button.addEventListener("click", () => {
      state.session.current = Number(button.dataset.questionIndex);
      persist(); renderQuiz();
    }));
    $("#submit-exam-top")?.addEventListener("click", openSubmitDialog);
    $("#exit-session")?.addEventListener("click", () => {
      if (window.confirm("Thoát phiên? Tiến độ sẽ được lưu để bạn quay lại sau.")) navigate("home");
    });
  }

  function openSubmitDialog() {
    const questions = sessionQuestionList();
    const unanswered = questions.filter((question) => answersFor(question.id).length === 0).length;
    $("#submit-summary").textContent = unanswered ? "Bạn còn " + unanswered + " câu chưa trả lời. Bạn vẫn có thể nộp bài và xem kết quả." : "Bạn đã trả lời tất cả câu hỏi. Sau khi nộp, đáp án và giải thích sẽ được hiển thị.";
    dialog.showModal();
  }

  function submitExam() {
    const questions = sessionQuestionList();
    const available = questions.filter((question) => !isUnavailable(question));
    const correct = available.filter((question) => isCorrect(question, answersFor(question.id))).length;
    state.lastResult = { mode: "exam", test: state.session.test, questions: state.session.questions.slice(), answers: { ...state.session.answers }, correct, available: available.length, total: questions.length, submittedAt: Date.now() };
    state.session.submitted = true;
    clearSaved();
    dialog.close();
    state.view = "results";
    render();
    announce("Bài thi đã được nộp. Đang hiển thị kết quả.");
  }

  function renderResults() {
    const result = state.lastResult;
    if (!result) { renderHome(); return; }
    const questions = result.questions.map((id) => state.questionMap.get(id)).filter(Boolean);
    const percent = result.available ? Math.round((result.correct / result.available) * 100) : null;
    const review = questions.map((question, index) => {
      const answer = result.answers[question.id] || [];
      const status = isUnavailable(question) ? "unavailable" : isCorrect(question, answer) ? "right" : "wrong";
      const statusText = status === "right" ? "ĐÚNG" : status === "wrong" ? "SAI" : "CHƯA CÓ ĐÁP ÁN";
      return '<details class="card review-item"><summary>Câu ' + (index + 1) + ': ' + escapeHtml(question.question) + '<span class="review-status ' + status + '">' + statusText + '</span></summary><p class="review-answer"><strong>Bạn chọn:</strong> ' + escapeHtml(answer.length ? answer.join(", ") : "Chưa trả lời") + '</p><p class="review-answer"><strong>Đáp án đúng:</strong> ' + (isUnavailable(question) ? "Chưa có dữ liệu" : escapeHtml(question.correctAnswers.join(", "))) + '</p>' + (question.explanation || question.reviewNote ? '<div class="feedback"><strong>Giải thích</strong>' + escapeHtml(question.explanation || question.reviewNote) + '</div>' : "") + '</details>';
    }).join("");
    app.innerHTML = '<section class="page" aria-labelledby="results-title"><p class="eyebrow">Tổng kết phiên thi</p><h1 id="results-title">Kết quả của bạn</h1><div class="card results-hero"><div class="score-ring"><strong>' + (percent == null ? "—" : percent + "%") + '</strong><span>' + (percent == null ? "chưa đủ dữ liệu" : "điểm số") + '</span></div><div><h2>' + escapeHtml(catalogTitle(result.test === "all" ? "Tất cả bộ đề" : result.test)) + '</h2><div class="result-summary"><span><strong>' + result.correct + '</strong>Đúng</span><span><strong>' + (result.total - result.correct) + '</strong>Cần xem lại</span><span><strong>' + result.total + '</strong>Tổng câu</span></div></div></div>' +
      (result.available < result.total ? '<p class="notice">Có ' + (result.total - result.available) + ' câu chưa có đáp án chuẩn. Những câu này không được tính là đúng.</p>' : "") + '<div class="quiz-top"><div><h2>Ôn lại câu hỏi</h2><p class="muted">Xem đáp án và giải thích sau khi nộp bài.</p></div><button type="button" class="button primary" id="new-session">Làm phiên mới</button></div><div class="review-list">' + review + '</div></section>';
    $("#new-session").addEventListener("click", () => navigate("home"));
  }

  function renderBank() {
    const query = state.bankQuery.toLowerCase().trim();
    const filtered = state.questions.filter((question) => (state.bankTest === "all" || question.source === state.bankTest) &&
      (!query || (question.question || "").toLowerCase().includes(query) || String(question.number).includes(query)));
    const items = filtered.map((question) => '<article class="card bank-item"><h3>Câu ' + question.number + ' · ' + escapeHtml(question.question) + '</h3><p>' + escapeHtml(catalogTitle(question.source)) + ' · ' + question.options.length + ' lựa chọn · ' + (question.requiredAnswers > 1 ? "nhiều đáp án" : "một đáp án") + '</p></article>').join("");
    app.innerHTML = '<section class="page" aria-labelledby="bank-title"><p class="eyebrow">Tra cứu</p><h1 id="bank-title">Ngân hàng câu hỏi</h1><p class="muted">Tìm kiếm nội dung câu hỏi mà không hiển thị đáp án hay giải thích.</p><div class="bank-toolbar"><input id="bank-search" type="search" placeholder="Tìm theo từ khóa hoặc số câu…" aria-label="Tìm câu hỏi" value="' + escapeHtml(state.bankQuery) + '"><select id="bank-test" aria-label="Lọc theo bộ đề"><option value="all">Tất cả bộ đề</option>' + state.catalog.map((item) => '<option value="' + item.id + '" ' + (state.bankTest === item.id ? "selected" : "") + '>' + escapeHtml(item.title) + '</option>').join("") + '</select></div><p class="bank-count">' + filtered.length + " / " + state.questions.length + " câu hỏi</p><div class=\"bank-list\">" + (items || '<div class="card empty">Không tìm thấy câu hỏi phù hợp.</div>') + "</div></section>";
    $("#bank-search").addEventListener("input", (event) => { state.bankQuery = event.target.value; renderBank(); $("#bank-search").focus(); });
    $("#bank-test").addEventListener("change", (event) => { state.bankTest = event.target.value; renderBank(); });
  }

  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) { event.preventDefault(); navigate(nav.dataset.nav); }
  });
  $$("#theme-toggle, #mobile-theme-toggle").forEach((button) => button.addEventListener("click", toggleTheme));
  $("#restore-session").addEventListener("click", restoreSession);
  $("#discard-session").addEventListener("click", clearSaved);
  $("#close-dialog").addEventListener("click", () => dialog.close());
  $("#cancel-submit").addEventListener("click", () => dialog.close());
  $("#confirm-submit").addEventListener("click", submitExam);
  document.addEventListener("keydown", (event) => {
    const drawer = $("#learning-drawer.open");
    if (!drawer) return;
    if (event.key === "Escape") {
      $("#close-learning")?.click();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = $$("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])", drawer)
      .filter((element) => element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!drawer.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (dialog.open || !state.session || !["practice", "exam"].includes(state.view)) return;
    const target = event.target;
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return;
    const questions = sessionQuestionList();
    if (event.key >= "1" && event.key <= "6") {
      const option = currentQuestion().options[Number(event.key) - 1];
      if (option && !state.session.checked[currentQuestion().id]) {
        const selected = answersFor(currentQuestion().id);
        const next = currentQuestion().requiredAnswers > 1
          ? (selected.includes(option.id) ? selected.filter((id) => id !== option.id) : selected.concat(option.id))
          : [option.id];
        state.session.answers[currentQuestion().id] = next;
        persist(); renderQuiz(); event.preventDefault();
      }
    } else if (event.key === "ArrowRight") {
      state.session.current = (state.session.current + 1) % questions.length; persist(); renderQuiz(); event.preventDefault();
    } else if (event.key === "ArrowLeft") {
      state.session.current = (state.session.current - 1 + questions.length) % questions.length; persist(); renderQuiz(); event.preventDefault();
    } else if (event.key.toLowerCase() === "m" && state.view === "exam") {
      const id = currentQuestion().id; state.session.flags[id] = !state.session.flags[id]; persist(); renderQuiz(); event.preventDefault();
    }
  });

  try { setTheme(localStorage.getItem(THEME_KEY) || "light"); } catch (_) { setTheme("light"); }
  loadData();
}());
