(() => {
  'use strict';
  const cfg = window.WENODO_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const state = {
    client: null, user: null, profile: null, courses: [], lessons: [], quizzes: [], progress: [], bookmarks: [], announcements: [],
    currentCourse: null, currentLesson: null, activeAttempt: null, answers: {}, timerId: null, deadline: null,
    folderView: localStorage.getItem('wn_lms_folder_view') === 'tree' ? 'tree' : 'cards',
    learningNav: { courseId:null, main:null, sub:null }, learningView: localStorage.getItem('wn_learning_view') === 'tree' ? 'tree' : 'cards', learningAddTab:'file', learningResourceMode:'link',
    lang: localStorage.getItem('wn_lms_lang') || 'en', theme: localStorage.getItem('wn_lms_theme') || 'light'
  };

  const text = {
    en: { overview:'Overview', courses:'My courses', bookmarks:'Bookmarks', results:'Quiz results', announcements:'Announcements', admin:'Admin tools', welcome:'Welcome back!' },
    si: { overview:'සාරාංශය', courses:'මගේ පාඨමාලා', bookmarks:'සුරැකි පාඩම්', results:'Quiz ප්‍රතිඵල', announcements:'නිවේදන', admin:'පරිපාලන මෙවලම්', welcome:'නැවතත් සාදරයෙන් පිළිගනිමු!' }
  };

  function toast(message, type='') {
    const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = message;
    $('toastRegion').appendChild(el); setTimeout(() => el.remove(), 5200);
  }
  function errorMessage(error) {
    const msg = error?.message || String(error || 'Unexpected error');
    if (/Invalid login credentials/i.test(msg)) return 'Email or password is incorrect.';
    if (/JWT|token.*expired/i.test(msg)) return 'Your session has expired. Please sign in again.';
    return msg;
  }
  function esc(value='') { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtDate(value) { if (!value) return ''; return new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}); }
  function isAdmin() { return ['lms_admin','super_admin'].includes(state.profile?.role); }
  function setBusy(button, busy, label='Working…') { if (!button) return; if (busy) { button.dataset.original = button.textContent; button.disabled = true; button.textContent = label; } else { button.disabled = false; if (button.dataset.original) button.textContent = button.dataset.original; } }

  async function init() {
    if (!window.supabase?.createClient || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_URL.includes('YOUR-PROJECT')) {
      $('authMessage').textContent = 'Setup required: add your Supabase URL and anon key to config.js.'; $('loginBtn').disabled = true; return;
    }
    state.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
    bindEvents(); applyTheme();
    const { data:{session} } = await state.client.auth.getSession();
    if (session) await enterApp(session.user);
    state.client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') showAuth();
      if (event === 'PASSWORD_RECOVERY') $('passwordDialog').showModal();
    });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }

  function bindEvents() {
    $('loginForm').addEventListener('submit', login);
    $('forgotPasswordBtn').addEventListener('click', forgotPassword);
    $('logoutBtn').addEventListener('click', logout);
    $('refreshBtn').addEventListener('click', () => loadData().then(() => toast('Learning Hub refreshed.','success')).catch(e=>toast(errorMessage(e),'error')));
    $('themeBtn').addEventListener('click', toggleTheme);
    $('langBtn').addEventListener('click', toggleLanguage);
    $('menuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.page)));
    document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.go)));
    document.querySelectorAll('[data-close-dialog]').forEach(btn => btn.addEventListener('click', () => $(btn.dataset.closeDialog).close()));
    $('globalSearch').addEventListener('input', debounce(searchAll, 220));
    $('learningSearch').addEventListener('input', debounce(renderLearningHub, 180));
    $('learningRefreshBtn').addEventListener('click', () => loadData().then(()=>toast('Learning Hub refreshed.','success')).catch(e=>toast(errorMessage(e),'error')));
    $('learningReloadBtn').addEventListener('click', () => loadData().then(()=>{state.learningNav={courseId:null,main:null,sub:null};renderLearningHub();toast('Learning Hub refreshed.','success');}).catch(e=>toast(errorMessage(e),'error')));
    $('openLearningAddBtn').addEventListener('click', openLearningAdd);
    $('learningAddForm').addEventListener('submit', submitLearningAdd);
    $('learningAddDialog').querySelectorAll('[data-close-learning-add]').forEach(b=>b.addEventListener('click',()=>$('learningAddDialog').close()));
    $('learningAddDialog').querySelectorAll('[data-add-tab]').forEach(b=>b.addEventListener('click',()=>setLearningAddTab(b.dataset.addTab)));
    $('learningAddDialog').querySelectorAll('[data-resource-mode]').forEach(b=>b.addEventListener('click',()=>setLearningResourceMode(b.dataset.resourceMode)));
    $('page-courses').addEventListener('click', handleLearningHubClick);
    $('completeLessonBtn').addEventListener('click', completeCurrentLesson);
    $('bookmarkLessonBtn').addEventListener('click', toggleCurrentBookmark);
    $('submitQuizBtn').addEventListener('click', submitQuiz);
    $('courseForm').addEventListener('submit', createCourse);
    $('lessonForm').addEventListener('submit', createLesson);
    $('quizForm').addEventListener('submit', createQuiz);
    $('questionForm').addEventListener('submit', createQuestion);
    $('announcementForm').addEventListener('submit', createAnnouncement);
    $('inviteForm').addEventListener('submit', inviteLearner);
    $('passwordForm').addEventListener('submit', updatePassword);
    $('questionType').addEventListener('change', () => $('mcqFields').hidden = $('questionType').value === 'written');
  }

  async function login(event) {
    event.preventDefault();
    if (state.loginInProgress) return;
    state.loginInProgress = true;
    const btn = $('loginBtn');
    const message = $('authMessage');
    setBusy(btn, true, 'Signing in…');
    message.textContent = 'Connecting to your Learning account…';
    try {
      if (!state.client) throw new Error('The Supabase client is not ready. Refresh the page and try again.');
      const { data, error } = await state.client.auth.signInWithPassword({
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value
      });
      if (error) throw error;
      if (!data?.user) throw new Error('Supabase did not return a user. Please try again.');
      message.textContent = 'Login successful. Loading your profile…';
      await enterApp(data.user);
      if (!$('appShell').hidden) message.textContent = '';
      else if (!message.textContent) message.textContent = 'Login succeeded, but the Learning profile could not be loaded.';
    } catch (e) {
      console.error('WenodoSL sign-in failed:', e);
      message.textContent = errorMessage(e);
    } finally {
      state.loginInProgress = false;
      setBusy(btn, false);
      if ($('authScreen').hidden) message.textContent = '';
      else if (!message.textContent) message.textContent = 'Sign-in did not complete. Please try again.';
    }
  }
  async function forgotPassword() {
    const email=$('loginEmail').value.trim(); if (!email) { $('authMessage').textContent='Enter your email address first.'; return; }
    try { const {error}=await state.client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname}); if(error)throw error; $('authMessage').textContent='Password reset email sent. Check your inbox.'; }
    catch(e){$('authMessage').textContent=errorMessage(e);}
  }
  async function logout() { if (state.activeAttempt) { if (!confirm('A quiz is in progress. Sign out anyway?')) return; } await state.client.auth.signOut(); state.user=null;state.profile=null;showAuth(); }
  function showAuth() { $('appShell').hidden=true; $('authScreen').hidden=false; $('loginPassword').value=''; state.profile=null; state.user=null; }

  async function enterApp(user) {
    state.user=user;
    try {
      const {data:profile,error}=await state.client.from('profiles').select('id,email,username,full_name,role,department').eq('id',user.id).single();
      if(error) throw error; state.profile=profile;
      $('authScreen').hidden=true; $('appShell').hidden=false;
      $('profileName').textContent=profile.full_name||profile.username||user.email;
      $('profileRole').textContent=roleLabel(profile.role); $('avatar').textContent=(profile.full_name||user.email||'W').trim().charAt(0).toUpperCase();
      document.querySelectorAll('.admin-only').forEach(el=>el.hidden=!isAdmin());
      await loadData(); navigate('home');
    } catch(e) { console.error(e); $('authScreen').hidden=false; $('appShell').hidden=true; $('authMessage').textContent='Signed in, but could not load your Learning profile: '+errorMessage(e); }
  }
  function roleLabel(role) { return ({student:'Learner',lms_admin:'LMS Admin',super_admin:'Super Admin'})[role] || 'Learner'; }

  async function loadData() {
    const c=state.client;
    const [courses,lessons,quizzes,progress,bookmarks,announcements] = await Promise.all([
      c.from('courses').select('*').order('created_at',{ascending:false}),
      c.from('lessons').select('*').order('position').order('created_at'),
      c.from('quizzes').select('*').order('created_at',{ascending:false}),
      c.from('lesson_progress').select('lesson_id,completed,last_position_seconds,updated_at').eq('user_id',state.user.id),
      c.from('bookmarks').select('lesson_id').eq('user_id',state.user.id),
      c.from('announcements').select('*').eq('is_published',true).order('created_at',{ascending:false}).limit(30)
    ]);
    for (const result of [courses,lessons,quizzes,progress,bookmarks,announcements]) if(result.error) throw result.error;
    state.courses=courses.data||[]; state.lessons=lessons.data||[]; state.quizzes=quizzes.data||[]; state.progress=progress.data||[]; state.bookmarks=bookmarks.data||[]; state.announcements=announcements.data||[];
    renderAll();
    loadResults().catch(err=>console.warn('Quiz summary unavailable:',err));
  }
  function renderAll() {
    const completed=state.progress.filter(x=>x.completed).length;
    $('statCourses').textContent=state.courses.length; $('statCompleted').textContent=completed;
    $('welcomeTitle').textContent=`${text[state.lang].welcome} ${state.profile.full_name?.split(' ')[0]||''}`;
    $('homeCourses').innerHTML=state.courses.slice(0,6).map(courseCard).join('')||empty('No courses have been published yet.');
    $('allCourses').innerHTML=state.courses.map(courseCard).join('')||empty('No courses available.'); $('courseCount').textContent=`${state.courses.length} courses`;
    renderLearningHub();
    $('homeAnnouncements').innerHTML=state.announcements.slice(0,3).map(announcementCard).join('')||empty('No announcements yet.');
    $('announcementList').innerHTML=state.announcements.map(announcementCard).join('')||empty('No announcements yet.');
    $('unreadBadge').hidden=true;
    renderBookmarks(); renderResults(); renderAdminLists(); fillAdminSelects();
  }
  function empty(message) { return `<div class="empty-state">${esc(message)}</div>`; }
  function courseProgress(courseId) {
    const ids=state.lessons.filter(l=>l.course_id===courseId).map(l=>l.id); if(!ids.length)return 0;
    const done=new Set(state.progress.filter(p=>p.completed).map(p=>p.lesson_id)); return Math.round(ids.filter(id=>done.has(id)).length/ids.length*100);
  }
  function courseCard(course) {
    const count=state.lessons.filter(l=>l.course_id===course.id).length, pct=courseProgress(course.id);
    return `<article class="course-card"><div class="course-top"><div class="course-icon">▤</div><span class="level-tag">${esc(course.level||'All levels')}</span></div><h3>${esc(course.title)}</h3><p>${esc(course.description||'Build knowledge with this learning path.')}</p><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><div class="course-foot"><span>${count} lessons · ${pct}% complete</span><button class="btn btn-quiet" data-open-course="${course.id}">Open →</button></div></article>`;
  }
  function announcementCard(a) { return `<article class="announcement-card"><time>${fmtDate(a.created_at)}</time><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p></article>`; }
  function navigate(page) {
    if(page==='admin'&&!isAdmin())return;
    document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==`page-${page}`);
    document.querySelectorAll('.nav-item[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
    $('pageTitle').textContent=text[state.lang][page]||({course:'Course details'}[page])||'Learning Hub';
    $('sidebar').classList.remove('open');
    if(page==='results') loadResults();
    if(page==='courses') renderLearningHub();
    if(page==='admin'&&isAdmin()) loadPendingAnswers();
  }
  document.addEventListener('click',event=>{
    const viewBtn=event.target.closest('[data-folder-view]'); if(viewBtn){state.folderView=viewBtn.dataset.folderView;localStorage.setItem('wn_lms_folder_view',state.folderView);if(state.currentCourse)openCourse(state.currentCourse.id);}
    const courseBtn=event.target.closest('[data-open-course]'); if(courseBtn)openCourse(courseBtn.dataset.openCourse);
    const lessonBtn=event.target.closest('[data-open-lesson]'); if(lessonBtn)openLesson(lessonBtn.dataset.openLesson);
    const quizBtn=event.target.closest('[data-start-quiz]'); if(quizBtn)beginQuiz(quizBtn.dataset.startQuiz);
    const bmBtn=event.target.closest('[data-bookmark]'); if(bmBtn)toggleBookmark(bmBtn.dataset.bookmark);
    const adminDelete=event.target.closest('[data-delete-course]'); if(adminDelete)deleteCourse(adminDelete.dataset.deleteCourse);
    const gradeBtn=event.target.closest('[data-grade-answer]'); if(gradeBtn)gradeWrittenAnswer(gradeBtn.dataset.gradeAnswer);
  });

  function openCourse(id) {
    const course=state.courses.find(c=>c.id===id); if(!course)return; state.currentCourse=course;
    $('courseHeader').innerHTML=`<p class="eyebrow">${esc(course.level||'LEARNING PATH')}</p><h2>${esc(course.title)}</h2><p>${esc(course.description||'')}</p><div class="progress-track"><div class="progress-fill" style="width:${courseProgress(id)}%"></div></div><small>${courseProgress(id)}% completed${course.deadline?` · Deadline ${fmtDate(course.deadline)}`:''}</small>`;
    const list=state.lessons.filter(l=>l.course_id===id);
    document.querySelectorAll('[data-folder-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.folderView===state.folderView));
    $('courseLessons').innerHTML=renderCourseFolders(id)||empty('No lessons in this course yet.');
    const qs=state.quizzes.filter(q=>q.course_id===id&&q.is_published);
    $('courseQuizzes').innerHTML=qs.length?`<h2>Quizzes & assessments</h2>${qs.map(q=>`<article class="quiz-card"><div><strong>${esc(q.title)}</strong><small>${q.time_limit_seconds?Math.round(q.time_limit_seconds/60)+' min · ':''}${q.questions_per_attempt} questions per attempt</small></div>${q.external_url?`<a class="btn btn-quiet" href="${esc(q.external_url)}" target="_blank" rel="noopener">Open Google Form ↗</a>`:''}${Number(q.question_count||0)>0?`<button class="btn btn-primary" data-start-quiz="${q.id}">Start quiz</button>`:''}</article>`).join('')}`:'';
    if(courseProgress(id)===100 && list.length){$('courseHeader').insertAdjacentHTML('beforeend',`<button id="certificateBtn" class="btn btn-primary" style="margin-top:14px">Get course certificate</button>`);$('certificateBtn').addEventListener('click',()=>issueCertificate(id));}
    navigate('course');
  }
  function handleLearningHubClick(event){
    const nav=event.target.closest('[data-learning-nav]'); if(nav){const kind=nav.dataset.learningNav;if(kind==='root')state.learningNav={courseId:null,main:null,sub:null};else if(kind==='course')state.learningNav={courseId:nav.dataset.courseId,main:null,sub:null};else if(kind==='main')state.learningNav={courseId:nav.dataset.courseId,main:nav.dataset.main,sub:null};else if(kind==='sub')state.learningNav={courseId:nav.dataset.courseId,main:nav.dataset.main,sub:nav.dataset.sub};renderLearningHub();return;}
    const view=event.target.closest('[data-learning-view]');if(view){state.learningView=view.dataset.learningView;localStorage.setItem('wn_learning_view',state.learningView);renderLearningHub();return;}
    const course=event.target.closest('[data-learning-course]');if(course){state.learningNav={courseId:course.dataset.learningCourse,main:null,sub:null};renderLearningHub();return;}
    const lesson=event.target.closest('[data-open-lesson]');if(lesson){openLesson(lesson.dataset.openLesson);return;}
    const quiz=event.target.closest('[data-learning-quiz]');if(quiz){const q=state.quizzes.find(x=>x.id===quiz.dataset.learningQuiz);if(q?.external_url)window.open(q.external_url,'_blank','noopener');else if(q)toast('Open this quiz from the course quiz section.','');}
  }
  function renderLearningHub(){
    const q=$('learningSearch')?.value.trim().toLowerCase()||'',nav=state.learningNav;
    $('learningStatSubjects').textContent=state.courses.length;
    $('learningStatResources').textContent=state.lessons.length;
    $('learningStatQuizzes').textContent=state.quizzes.length;
    const recent=state.progress.slice().sort((a,b)=>new Date(b.updated_at||0)-new Date(a.updated_at||0)).slice(0,5);
    $('learningRecentList').innerHTML=recent.length?recent.map(p=>{const l=state.lessons.find(x=>x.id===p.lesson_id);return l?'<div class="learning-recent-item"><span>▤</span><div><strong>'+esc(l.title)+'</strong><small>'+esc(l.main_folder||'Lessons')+' › '+esc(l.subfolder||'General')+'</small></div><small>'+(p.completed?'Completed':'In progress')+'</small></div>':''}).join('')||empty('No learning activity yet.') : empty('No learning activity yet.');
    document.querySelectorAll('[data-learning-view]').forEach(b=>b.classList.toggle('active',b.dataset.learningView===state.learningView));
    const crumbs=[{label:'⌂ All',kind:'root'}];
    if(nav.courseId){const c=state.courses.find(x=>x.id===nav.courseId);crumbs.push({label:c?.title||'Subject',kind:'course',courseId:nav.courseId});}
    if(nav.main)crumbs.push({label:nav.main,kind:'main',courseId:nav.courseId,main:nav.main});
    if(nav.sub)crumbs.push({label:nav.sub,kind:'sub',courseId:nav.courseId,main:nav.main,sub:nav.sub});
    $('learningCrumbs').innerHTML=crumbs.map((x,i)=>i===crumbs.length-1?'<span>'+esc(x.label)+'</span>':'<button type="button" data-learning-nav="'+x.kind+'" '+(x.courseId?'data-course-id="'+x.courseId+'"':'')+(x.main?' data-main="'+esc(x.main)+'"':'')+(x.sub?' data-sub="'+esc(x.sub)+'"':'')+'>'+esc(x.label)+'</button>').join('<span class="crumb-sep">›</span>');
    let lessons=state.lessons.slice(),courses=state.courses.slice();
    if(q){const matched=lessons.filter(l=>(l.title+' '+(l.description||'')+' '+(l.main_folder||'')+' '+(l.subfolder||'')).toLowerCase().includes(q));$('learningContent').innerHTML=matched.length?'<div class="learning-material-list">'+matched.map(learningLessonRow).join('')+'</div>':empty('No learning materials match your search.');return;}
    if(!nav.courseId){
      $('learningContent').innerHTML=state.learningView==='tree'?renderLearningTree():courses.length?'<div class="learning-folder-grid">'+courses.map(c=>{const count=lessons.filter(l=>l.course_id===c.id).length;return '<button type="button" class="learning-folder-card" data-learning-course="'+c.id+'"><span class="learning-folder-icon">📁</span><strong>'+esc(c.title)+'</strong><small>'+esc(c.level||'Learning subject')+'</small><em>'+count+' resources</em></button>';}).join('')+'</div>':empty('No learning folders yet.');
      return;
    }
    const course=state.courses.find(c=>c.id===nav.courseId);if(!course){$('learningContent').innerHTML=empty('Subject not found.');return;}
    const rows=lessons.filter(l=>l.course_id===nav.courseId);
    const groups=new Map();rows.forEach(l=>{const m=l.main_folder||'Lessons',s=l.subfolder||'General';if(!groups.has(m))groups.set(m,new Map());if(!groups.get(m).has(s))groups.get(m).set(s,[]);groups.get(m).get(s).push(l);});
    if(!nav.main){
      $('learningContent').innerHTML=state.learningView==='tree'?renderLearningTree(course,groups):'<div class="learning-folder-grid">'+[...groups.entries()].map(([m,subs])=>'<button type="button" class="learning-folder-card subfolder-card" data-learning-nav="main" data-course-id="'+course.id+'" data-main="'+esc(m)+'"><span class="learning-folder-icon">📂</span><strong>'+esc(m)+'</strong><small>Main folder</small><em>'+[...subs.values()].reduce((n,a)=>n+a.length,0)+' resources</em></button>').join('')+'</div>'+(!groups.size?empty('No learning folders in this subject yet.'): '');
      return;
    }
    if(!nav.sub){
      const subs=groups.get(nav.main);$('learningContent').innerHTML=subs?'<div class="learning-folder-grid">'+[...subs.entries()].map(([s,items])=>'<button type="button" class="learning-folder-card subfolder-card" data-learning-nav="sub" data-course-id="'+course.id+'" data-main="'+esc(nav.main)+'" data-sub="'+esc(s)+'"><span class="learning-folder-icon">📁</span><strong>'+esc(s)+'</strong><small>'+esc(nav.main)+'</small><em>'+items.length+' files</em></button>').join('')+'</div>':empty('No topics in this folder.');return;
    }
    const items=groups.get(nav.main)?.get(nav.sub)||[];
    const quizzes=state.quizzes.filter(x=>x.course_id===nav.courseId&&x.is_published);
    $('learningContent').innerHTML=(isAdmin()?'<div class="learning-inline-actions"><button class="btn btn-primary" type="button" id="quickAddInFolder">＋ Add content here</button></div>':'')+
      '<div class="learning-material-list">'+items.map(learningLessonRow).join('')+'</div>'+(!items.length?empty('No files in this folder yet.'): '')+
      (quizzes.length?'<h3 class="learning-quiz-heading">Quiz forms & assessments</h3>'+quizzes.map(x=>'<div class="learning-quiz-row"><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.questions_per_attempt||0)+' questions</small></div>'+(x.external_url?'<a class="btn btn-primary" href="'+esc(x.external_url)+'" target="_blank" rel="noopener">Take quiz ↗</a>':'<button class="btn btn-quiet" data-learning-quiz="'+x.id+'">Open quiz</button>')+'</div>').join(''):'');
    const quick=$('quickAddInFolder');if(quick)quick.addEventListener('click',()=>openLearningAdd());
  }
  function learningLessonRow(l){
    const done=state.progress.some(p=>p.lesson_id===l.id&&p.completed),type=(l.content_type||'').toLowerCase();
    return '<article class="learning-material-row"><span class="learning-file-icon">'+(type==='pdf'?'▧':type==='video'?'▶':type==='slides'?'▤':'↗')+'</span><div class="learning-material-copy"><strong>'+esc(l.title)+'</strong><small>'+esc(l.content_type||'Resource')+(l.description?' · '+esc(l.description):'')+'</small></div>'+(done?'<span class="done-pill">Completed</span>':'')+'<button type="button" class="btn btn-quiet" data-open-lesson="'+l.id+'">Open →</button></article>';
  }
  function renderLearningTree(course,groups){
    const all=course?[...groups.entries()]:state.courses.map(c=>[c.title,new Map([[c.id,state.lessons.filter(l=>l.course_id===c.id)]])]);
    return '<div class="learning-tree">'+all.map(([main,subs])=>course?'<details open><summary>📂 '+esc(main)+'</summary>'+[...subs.entries()].map(([sub,items])=>'<details class="learning-tree-sub"><summary>📁 '+esc(sub)+' <small>'+items.length+'</small></summary>'+items.map(learningLessonRow).join('')+'</details>').join('')+'</details>':'<details><summary>📁 '+esc(main)+'</summary>'+subs.values().next().value.map(learningLessonRow).join('')+'</details>').join('')+'</div>';
  }
  function openLearningAdd(){
    if(!isAdmin())return;
    const nav=state.learningNav;
    $('learningAddCourse').innerHTML=state.courses.map(c=>'<option value="'+c.id+'">'+esc(c.title)+'</option>').join('');
    if(nav.courseId)$('learningAddCourse').value=nav.courseId;
    $('learningAddMain').value=nav.main||'';
    $('learningAddSub').value=nav.sub||'';
    setLearningAddTab('file');setLearningResourceMode('link');
    $('learningAddDialog').showModal();
  }
  function setLearningAddTab(tab){
    state.learningAddTab=tab;
    $('learningAddDialog').querySelectorAll('[data-add-tab]').forEach(b=>b.classList.toggle('active',b.dataset.addTab===tab));
    $('learningAddFileFields').hidden=tab!=='file';$('learningAddQuizFields').hidden=tab!=='quiz';
    $('learningAddSubmit').textContent=tab==='file'?'Add to Learning Hub':'Add quiz link';
  }
  function setLearningResourceMode(mode){
    state.learningResourceMode=mode;
    $('learningAddDialog').querySelectorAll('[data-resource-mode]').forEach(b=>b.classList.toggle('active',b.dataset.resourceMode===mode));
    $('learningLinkField').hidden=mode!=='link';$('learningUploadField').hidden=mode!=='upload';
  }
  async function submitLearningAdd(event){
    event.preventDefault();const form=event.currentTarget,f=new FormData(form),tab=state.learningAddTab;
    const btn=$('learningAddSubmit');setBusy(btn,true,'Saving…');
    try{
      const courseId=f.get('course_id'),main=String(f.get('main_folder')||'Lessons').trim(),sub=String(f.get('subfolder')||'General').trim(),title=String(f.get('title')||'').trim();
      if(tab==='quiz'){
        const url=String(f.get('external_url')||'').trim();if(!url)throw new Error('Enter a Google Form URL.');
        const {error}=await state.client.from('quizzes').insert({course_id:courseId,title,external_url:url,questions_per_attempt:0,time_limit_seconds:null,max_attempts:0,is_published:true,created_by:state.user.id});
        if(error)throw error;
      }else{
        const file=f.get('resource_file');let url=String(f.get('resource_url')||'').trim(),type=String(f.get('content_type')||'auto');
        if(state.learningResourceMode==='upload'){
          if(!file||!file.size)throw new Error('Choose a file to upload.');
          if(file.size>25*1024*1024)throw new Error('File must be smaller than 25 MB.');
          const ext=(file.name.split('.').pop()||'').toLowerCase(),mime=file.type||'application/octet-stream';
          if(type==='auto')type=mime==='application/pdf'||ext==='pdf'?'pdf':mime.startsWith('video/')?'video':['ppt','pptx'].includes(ext)?'slides':['doc','docx','xls','xlsx','txt'].includes(ext)?'document':'file';
          const safe=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-100)||'learning-file';
          const path=courseId+'/'+Date.now()+'-'+safe;
          const {error}=await state.client.storage.from('learning-files').upload(path,file,{upsert:false,contentType:mime});if(error)throw error;
          url='storage://'+path;
        }else if(!url)throw new Error('Paste a resource link.');
        if(type==='auto')type=/\.pdf([?#]|$)/i.test(url)?'pdf':/youtu|vimeo|\.mp4|\.webm/i.test(url)?'video':'link';
        const {error}=await state.client.from('lessons').insert({course_id:courseId,main_folder:main||'Lessons',subfolder:sub||'General',title,resource_url:url,content_type:type,description:f.get('description')||'',is_published:true,created_by:state.user.id});
        if(error)throw error;
      }
      form.reset();$('learningAddDialog').close();await loadData();renderLearningHub();toast(tab==='file'?'Learning material added.':'Quiz link added.','success');
    }catch(error){toast(errorMessage(error),'error');}
    finally{setBusy(btn,false);}
  }
  function renderCourseFolders(courseId) {
    const rows=state.lessons.filter(l=>l.course_id===courseId);
    if(!rows.length)return '';
    const tree=new Map();
    rows.forEach(lesson=>{
      const main=lesson.main_folder||'Lessons', sub=lesson.subfolder||'General';
      if(!tree.has(main))tree.set(main,new Map());
      const topics=tree.get(main);
      if(!topics.has(sub))topics.set(sub,[]);
      topics.get(sub).push(lesson);
    });
    if(state.folderView==='tree'){
      return [...tree.entries()].map(([main,topics])=>`<details class="folder-tree-main" open><summary><span>📁 ${esc(main)}</span><small>${[...topics.values()].reduce((n,a)=>n+a.length,0)} items</small></summary>${[...topics.entries()].map(([sub,items])=>`<details class="folder-tree-sub" open><summary><span>📂 ${esc(sub)}</span><small>${items.length} items</small></summary><div class="lesson-list">${items.map(lessonRow).join('')}</div></details>`).join('')}</details>`).join('');
    }
    return [...tree.entries()].map(([main,topics])=>`<section class="folder-card"><div class="folder-card-head"><span class="folder-symbol">📁</span><div><h3>${esc(main)}</h3><small>${[...topics.values()].reduce((n,a)=>n+a.length,0)} learning items</small></div></div><div class="folder-topic-grid">${[...topics.entries()].map(([sub,items])=>`<section class="folder-topic"><h4>📂 ${esc(sub)}</h4><div class="lesson-list">${items.map(lessonRow).join('')}</div></section>`).join('')}</div></section>`).join('');
  }

  function lessonRow(lesson) {
    const done=state.progress.some(p=>p.lesson_id===lesson.id&&p.completed),bookmarked=state.bookmarks.some(b=>b.lesson_id===lesson.id);
    return `<div class="lesson-row"><div class="lesson-icon">${lesson.content_type==='video'?'▶':lesson.content_type==='pdf'?'▧':'↗'}</div><div class="lesson-copy"><strong>${esc(lesson.title)}</strong><small>${esc(lesson.content_type||'Resource')}${lesson.duration_seconds?' · '+Math.round(lesson.duration_seconds/60)+' min':''}</small></div>${done?'<span class="done-pill">Completed</span>':''}<div class="lesson-actions"><button title="Bookmark" data-bookmark="${lesson.id}">${bookmarked?'★':'☆'}</button><button class="btn btn-quiet" data-open-lesson="${lesson.id}">Open →</button></div></div>`;
  }
  async function openLesson(id) {
    const lesson=state.lessons.find(l=>l.id===id); if(!lesson)return; state.currentLesson=lesson;
    $('lessonDialogTitle').textContent=lesson.title;
    const url=await resolveResourceUrl(lesson.resource_url);
    const embed=toEmbed(url,lesson.content_type);
    const isDirectVideo=lesson.content_type==='video' && /\.(mp4|webm)(\?|$)/i.test(url);
    $('lessonViewer').innerHTML=isDirectVideo?`<video id="lessonVideo" controls playsinline preload="metadata" src="${esc(url)}"></video>`:embed?`<iframe src="${esc(embed)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`:`<div class="file-placeholder"><p>${esc(lesson.description||'Open this learning resource.')}</p><a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener">Open resource ↗</a></div>`;
    const video=$('lessonVideo');if(video){let lastSaved=0;const saved=state.progress.find(p=>p.lesson_id===lesson.id);video.addEventListener('loadedmetadata',()=>{if(saved&&!saved.completed&&saved.last_position_seconds>5&&saved.last_position_seconds<video.duration-5)video.currentTime=saved.last_position_seconds;},{once:true});video.addEventListener('timeupdate',()=>{if(Math.floor(video.currentTime)-lastSaved>=15){lastSaved=Math.floor(video.currentTime);saveVideoPosition(lesson.id,lastSaved);}});video.addEventListener('ended',()=>completeCurrentLesson());}
    const done=state.progress.some(p=>p.lesson_id===id&&p.completed),bookmarked=state.bookmarks.some(b=>b.lesson_id===id);
    $('completeLessonBtn').textContent=done?'Completed ✓':'Mark as completed'; $('completeLessonBtn').disabled=done;
    $('bookmarkLessonBtn').textContent=bookmarked?'★ Remove bookmark':'☆ Save bookmark';
    $('lessonDialog').showModal();
  }
  async function resolveResourceUrl(value) {
    if(!String(value||'').startsWith('storage://'))return value;
    const path=value.slice('storage://'.length); const {data,error}=await state.client.storage.from('learning-files').createSignedUrl(path,3600); if(error)throw error; return data.signedUrl;
  }
  function toEmbed(url,type) {
    try {const u=new URL(url); if(type==='video'&&u.hostname.includes('youtube.com')){const id=u.searchParams.get('v');if(id)return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;}
      if(u.hostname==='youtu.be')return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
      if(u.hostname.includes('drive.google.com')){const m=u.pathname.match(/\/d\/([^/]+)/);if(m)return `https://drive.google.com/file/d/${m[1]}/preview`;}
      if(u.hostname.includes('vimeo.com')){const id=u.pathname.split('/').filter(Boolean).pop();if(id)return `https://player.vimeo.com/video/${id}`;}
      if(type==='pdf'||/\\.pdf(\\?|$)/i.test(url))return url;
      if(type==='video'&&/\.(mp4|webm)(\?|$)/i.test(url))return url;
    }catch(e){} return '';
  }
  async function saveVideoPosition(lessonId,seconds){
    const {error}=await state.client.from('lesson_progress').upsert({user_id:state.user.id,lesson_id:lessonId,last_position_seconds:Math.max(0,Math.floor(seconds)),updated_at:new Date().toISOString()},{onConflict:'user_id,lesson_id'});
    if(error)console.warn('Could not save video position:',error.message);else{const existing=state.progress.find(p=>p.lesson_id===lessonId);if(existing)existing.last_position_seconds=seconds;else state.progress.push({lesson_id:lessonId,last_position_seconds:seconds,completed:false});}
  }
  async function completeCurrentLesson() {
    const lesson=state.currentLesson;if(!lesson)return;
    const {error}=await state.client.from('lesson_progress').upsert({user_id:state.user.id,lesson_id:lesson.id,completed:true,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'user_id,lesson_id'});
    if(error){toast(errorMessage(error),'error');return;} state.progress=state.progress.filter(p=>p.lesson_id!==lesson.id);state.progress.push({lesson_id:lesson.id,completed:true});$('lessonDialog').close();renderAll();if(state.currentCourse)openCourse(state.currentCourse.id);toast('Lesson marked as completed.','success');
  }
  async function toggleCurrentBookmark(){if(state.currentLesson)await toggleBookmark(state.currentLesson.id);const b=state.bookmarks.some(x=>x.lesson_id===state.currentLesson?.id);$('bookmarkLessonBtn').textContent=b?'★ Remove bookmark':'☆ Save bookmark';}
  async function toggleBookmark(id) {
    const exists=state.bookmarks.some(b=>b.lesson_id===id);
    if(exists){const {error}=await state.client.from('bookmarks').delete().eq('user_id',state.user.id).eq('lesson_id',id);if(error)throw error;state.bookmarks=state.bookmarks.filter(b=>b.lesson_id!==id);}
    else{const {error}=await state.client.from('bookmarks').insert({user_id:state.user.id,lesson_id:id});if(error)throw error;state.bookmarks.push({lesson_id:id});}
    renderBookmarks(); if(state.currentCourse)openCourse(state.currentCourse.id);
  }
  function renderBookmarks(){const list=state.bookmarks.map(b=>state.lessons.find(l=>l.id===b.lesson_id)).filter(Boolean);$('bookmarkList').innerHTML=list.map(lessonRow).join('')||empty('No bookmarked lessons yet.');}

  async function beginQuiz(quizId) {
    try {
      const {data,error}=await state.client.rpc('start_quiz',{p_quiz_id:quizId});if(error)throw error;
      state.activeAttempt=data;state.answers={};state.deadline=new Date(data.deadline_at).getTime();
      $('quizDialogTitle').textContent=data.quiz_title;
      $('quizQuestions').innerHTML=data.questions.map((q,i)=>questionMarkup(q,i)).join('');
      $('quizProgressText').textContent=`${data.questions.length} questions`;
      $('quizDialog').showModal();startTimer();
    } catch(e){toast(errorMessage(e),'error');}
  }
  function questionMarkup(q,i) {
    const opts=Array.isArray(q.options)?q.options:[];
    const input=q.question_type==='written'?`<textarea data-answer="${q.id}" rows="4" maxlength="3000" placeholder="Write your answer…"></textarea>`:opts.map((o,idx)=>o?`<label class="question-option"><input type="radio" name="q_${q.id}" value="${String.fromCharCode(65+idx)}"><span><b>${String.fromCharCode(65+idx)}.</b> ${esc(o)}</span></label>`:'').join('');
    return `<article class="question-card"><p class="eyebrow">QUESTION ${i+1} · ${esc(q.difficulty||'Medium')} · ${q.marks} mark(s)</p><h3>${esc(q.question)}</h3>${input}</article>`;
  }
  function startTimer(){clearInterval(state.timerId);const tick=()=>{const left=Math.max(0,Math.floor((state.deadline-Date.now())/1000));$('quizTimer').textContent=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;if(left<=0){clearInterval(state.timerId);submitQuiz(true);}};tick();state.timerId=setInterval(tick,1000);}
  async function submitQuiz(auto=false) {
    if(!state.activeAttempt)return;const btn=$('submitQuizBtn');if(!auto&&!confirm('Submit your answers now?'))return;setBusy(btn,true,'Submitting…');clearInterval(state.timerId);
    try {
      const answers=state.activeAttempt.questions.map(q=>{if(q.question_type==='written')return {id:q.id,answer:$(`[data-answer="${q.id}"]`)?.value||''};const selected=document.querySelector(`input[name="q_${q.id}"]:checked`);return {id:q.id,answer:selected?.value||''};});
      const {data,error}=await state.client.rpc('submit_quiz',{p_attempt_id:state.activeAttempt.attempt_id,p_answers:answers});if(error)throw error;
      state.activeAttempt=null;$('quizDialog').close();$('quizResultBody').innerHTML=`<div class="result-score"><strong>${data.percentage}%</strong><span>${data.score} / ${data.max_score} marks</span></div><p class="muted">Correct: ${data.correct_count} · Wrong: ${data.wrong_count}${data.pending_review?` · Written answers awaiting review: ${data.pending_review}`:''}</p>`;$('resultDialog').showModal();await loadResults();
    }catch(e){toast(errorMessage(e),'error');if(auto){$('quizDialog').close();state.activeAttempt=null;}}
    finally{setBusy(btn,false);}
  }
  async function loadResults(){
    const {data,error}=await state.client.from('quiz_attempts').select('id,quiz_id,score,max_score,percentage,correct_count,wrong_count,pending_review,started_at,submitted_at,status,quizzes(title)').eq('user_id',state.user.id).order('started_at',{ascending:false}).limit(100);
    if(error){toast(errorMessage(error),'error');return;}const rows=data||[];
    $('statAttempts').textContent=rows.filter(r=>r.status==='submitted').length;const completed=rows.filter(r=>r.status==='submitted');$('statAverage').textContent=completed.length?Math.round(completed.reduce((a,r)=>a+Number(r.percentage||0),0)/completed.length)+'%':'—';
    $('resultSummary').innerHTML=`<article class="stat-card"><span>Total attempts</span><strong>${completed.length}</strong></article><article class="stat-card"><span>Average score</span><strong>${$('statAverage').textContent}</strong></article><article class="stat-card"><span>Best score</span><strong>${completed.length?Math.max(...completed.map(r=>Number(r.percentage||0)))+'%':'—'}</strong></article><article class="stat-card"><span>Awaiting review</span><strong>${rows.reduce((a,r)=>a+Number(r.pending_review||0),0)}</strong></article>`;
    $('resultList').innerHTML=rows.length?`<table><thead><tr><th>Quiz</th><th>Date</th><th>Score</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.quizzes?.title||'Quiz')}</td><td>${fmtDate(r.submitted_at||r.started_at)}</td><td>${r.status==='submitted'?`${Number(r.percentage||0)}%`:'In progress'}</td><td>${r.pending_review?`${r.pending_review} pending review`:esc(r.status)}</td></tr>`).join('')}</tbody></table>`:empty('No quiz attempts yet.');
  }
  function renderResults(){/* Loaded on results navigation to keep initial requests light. */}

  function fillAdminSelects(){if(!isAdmin())return;const opts=state.courses.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('');$('lessonCourseSelect').innerHTML=opts;$('quizCourseSelect').innerHTML=opts;const qopts=state.quizzes.map(q=>`<option value="${q.id}">${esc(q.title)}</option>`).join('');$('questionQuizSelect').innerHTML=qopts;}
  function renderAdminLists(){if(!isAdmin())return;$('adminCourseList').innerHTML=state.courses.map(c=>`<div class="simple-list-row"><span>${esc(c.title)}</span><button class="text-btn" data-delete-course="${c.id}">Archive</button></div>`).join('')||empty('No courses yet.');}
  async function createCourse(e){e.preventDefault();const form=e.currentTarget,f=new FormData(form),payload={title:f.get('title').trim(),description:f.get('description'),level:f.get('level'),deadline:f.get('deadline')||null,is_published:f.get('published')==='on',created_by:state.user.id};try{const {error}=await state.client.from('courses').insert(payload);if(error)throw error;form.reset();await loadData();toast('Course created.','success');}catch(err){toast(errorMessage(err),'error');}}
  async function createLesson(e){
    e.preventDefault();
    const form=e.currentTarget;
    const f=new FormData(form),file=f.get('resource_file'),courseId=f.get('course_id');
    let resourceUrl=String(f.get('resource_url')||'').trim(),contentType=f.get('content_type');
    try{
      if(file&&file.size){
        if(file.size>25*1024*1024)throw new Error('Please upload a file smaller than 25 MB.');
        const ext=(file.name.split('.').pop()||'').toLowerCase();
        const mime=file.type||'application/octet-stream';
        if(mime==='application/pdf'||ext==='pdf')contentType='pdf';
        else if(mime.startsWith('video/')||['mp4','webm','mov'].includes(ext))contentType='video';
        else if(['ppt','pptx'].includes(ext))contentType='slides';
        else if(['doc','docx','xls','xlsx','txt'].includes(ext))contentType='document';
        else if(['png','jpg','jpeg','gif','webp'].includes(ext))contentType='file';
        const safeName=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(-100)||'learning-file';
        const path=`${courseId}/${Date.now()}-${safeName}`;
        const {error:uploadError}=await state.client.storage.from('learning-files').upload(path,file,{upsert:false,contentType:mime});
        if(uploadError)throw uploadError;
        resourceUrl='storage://'+path;
      }
      if(!resourceUrl)throw new Error('Add a resource URL or choose a file to upload.');
      const payload={course_id:courseId,main_folder:String(f.get('main_folder')||'Lessons').trim()||'Lessons',subfolder:String(f.get('subfolder')||'').trim(),title:f.get('title').trim(),resource_url:resourceUrl,content_type:contentType,description:f.get('description'),is_published:true,created_by:state.user.id};
      const {error}=await state.client.from('lessons').insert(payload);if(error)throw error;
      form.reset();await loadData();toast('Learning material added.','success');
    }catch(err){toast(errorMessage(err),'error');}
  }
  async function createQuiz(e){e.preventDefault();const form=e.currentTarget,f=new FormData(form),payload={course_id:f.get('course_id'),title:f.get('title').trim(),time_limit_seconds:Number(f.get('time_limit_seconds'))*60,questions_per_attempt:Number(f.get('questions_per_attempt')),max_attempts:Number(f.get('max_attempts')),is_published:f.get('published')==='on',created_by:state.user.id};try{const {error}=await state.client.from('quizzes').insert(payload);if(error)throw error;form.reset();await loadData();toast('Quiz created. Add questions below.','success');}catch(err){toast(errorMessage(err),'error');}}
  async function createQuestion(e){
    e.preventDefault();
    const form=e.currentTarget;
    const f=new FormData(form),kind=f.get('question_type');
    const opts=['option_a','option_b','option_c','option_d'].map(k=>String(f.get(k)||'').trim());
    const correct=String(f.get('correct_option')||'A');
    if(kind==='mcq'&&opts.filter(Boolean).length<2){toast('Add at least two options.','error');return;}
    if(kind==='mcq'&&!opts['ABCD'.indexOf(correct)]){toast('Enter text for the selected correct option.','error');return;}
    const payload={quiz_id:f.get('quiz_id'),question:f.get('question').trim(),question_type:kind,options:kind==='mcq'?opts:[],correct_option:kind==='mcq'?correct:null,marks:Number(f.get('marks')),explanation:f.get('explanation'),marking_guide:kind==='written'?f.get('explanation'):'',difficulty:f.get('difficulty'),created_by:state.user.id};
    try{const {error}=await state.client.from('quiz_questions').insert(payload);if(error)throw error;form.reset();$('mcqFields').hidden=false;await loadData();toast('Question saved.','success');}
    catch(err){toast(errorMessage(err),'error');}
  }
  async function createAnnouncement(e){e.preventDefault();const form=e.currentTarget,f=new FormData(form);try{const {error}=await state.client.from('announcements').insert({title:f.get('title').trim(),body:f.get('body').trim(),is_published:true,created_by:state.user.id});if(error)throw error;form.reset();await loadData();toast('Announcement published.','success');}catch(err){toast(errorMessage(err),'error');}}
  async function inviteLearner(e){e.preventDefault();const form=e.currentTarget,f=new FormData(form),btn=form.querySelector('button[type=submit]');setBusy(btn,true,'Sending invite…');try{const {data:{session}}=await state.client.auth.getSession();const response=await fetch(`${cfg.SUPABASE_URL}/functions/v1/admin-create-user`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':cfg.SUPABASE_ANON_KEY},body:JSON.stringify({email:f.get('email').trim(),full_name:f.get('full_name').trim(),username:f.get('username').trim()})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not send invitation.');form.reset();toast('Invitation email sent.','success');}catch(err){toast(errorMessage(err),'error');}finally{setBusy(btn,false);}}
  async function loadPendingAnswers(){
    if(!isAdmin())return;
    const {data,error}=await state.client.from('quiz_answers').select('id,answer,question_id,attempt_id,quiz_questions(question,marks)').eq('pending_review',true).order('id').limit(100);
    if(error){$('pendingAnswers').innerHTML=empty('Could not load pending answers.');return;}
    if(!data?.length){$('pendingAnswers').innerHTML=empty('No written answers awaiting review.');return;}
    const attemptIds=[...new Set(data.map(x=>x.attempt_id))];
    const attempts=await state.client.from('quiz_attempts').select('id,user_id,quiz_id,profiles(full_name,email),quizzes(title)').in('id',attemptIds);
    const byId=new Map((attempts.data||[]).map(x=>[x.id,x]));
    $('pendingAnswers').innerHTML=data.map(a=>{const attempt=byId.get(a.attempt_id);return `<div class="panel" style="margin:8px 0;padding:13px"><p class="eyebrow">${esc(attempt?.profiles?.full_name||attempt?.profiles?.email||'Learner')} · ${esc(attempt?.quizzes?.title||'Quiz')}</p><strong>${esc(a.quiz_questions?.question||'Written question')}</strong><p class="muted" style="font-size:12px;margin:8px 0">${esc(a.answer)}</p><div class="form-row"><label>Marks (max ${Number(a.quiz_questions?.marks)||1})<input id="marks_${a.id}" type="number" min="0" max="${Number(a.quiz_questions?.marks)||1}" step="0.5" value="0"></label><label>Feedback<textarea id="feedback_${a.id}" rows="2"></textarea></label></div><button class="btn btn-primary" data-grade-answer="${a.id}">Save grade</button></div>`;}).join('');
  }
  async function gradeWrittenAnswer(id){
    const marks=Number($(`marks_${id}`).value),feedback=$(`feedback_${id}`).value;
    const {error}=await state.client.rpc('grade_written_answer',{p_answer_id:id,p_marks:marks,p_feedback:feedback});
    if(error){toast(errorMessage(error),'error');return;}toast('Written answer graded.','success');await loadPendingAnswers();await loadResults();
  }
  async function updatePassword(event){
    event.preventDefault();
    const form=event.currentTarget;const f=new FormData(event.currentTarget),password=f.get('password'),confirmPassword=f.get('confirm');
    if(password!==confirmPassword){toast('Passwords do not match.','error');return;}
    if(password.length<10){toast('Use at least 10 characters.','error');return;}
    const {error}=await state.client.auth.updateUser({password});if(error){toast(errorMessage(error),'error');return;}
    $('passwordDialog').close();form.reset();toast('Password updated successfully.','success');
  }

  async function deleteCourse(id){if(!confirm('Archive this course? Its lessons and quiz records will remain in the database.'))return;const {error}=await state.client.from('courses').update({is_published:false}).eq('id',id);if(error){toast(errorMessage(error),'error');return;}await loadData();toast('Course unpublished.','success');}

  async function issueCertificate(courseId){
    try{const {data,error}=await state.client.rpc('issue_course_certificate',{p_course_id:courseId});if(error)throw error;const course=state.courses.find(c=>c.id===courseId);const html=`<!doctype html><html><head><meta charset="utf-8"><title>Certificate</title><style>body{font-family:Georgia,serif;background:#f6f7fb;padding:40px;color:#17213b}.cert{max-width:900px;margin:auto;background:white;border:10px double #3157d5;padding:70px;text-align:center}.small{letter-spacing:5px;color:#3157d5}.name{font-size:38px;margin:25px}.course{font-size:28px;color:#3157d5}.code{margin-top:45px;font-size:12px;color:#71809c}</style></head><body><div class="cert"><p class="small">WENODOSL LEARNING HUB</p><h1>Certificate of Completion</h1><p>This certificate is proudly presented to</p><div class="name">${esc(state.profile.full_name||state.profile.email)}</div><p>for successfully completing</p><div class="course">${esc(course?.title||'Learning Course')}</div><p>${fmtDate(data.issued_at||new Date().toISOString())}</p><div class="code">Certificate ID: ${esc(data.certificate_code)}</div></div><script>window.onload=()=>window.print()<\/script></body></html>`;const w=window.open('','_blank');if(!w)throw new Error('Allow pop-ups to print your certificate.');w.document.write(html);w.document.close();toast('Certificate issued.','success');}catch(e){toast(errorMessage(e),'error');}
  }

  function searchAll(){const q=$('globalSearch').value.trim().toLowerCase();if(!q){navigate('courses');$('allCourses').innerHTML=state.courses.map(courseCard).join('')||empty('No courses available.');return;}const matches=state.lessons.filter(l=>`${l.title} ${l.description||''} ${l.main_folder||''} ${l.subfolder||''}`.toLowerCase().includes(q));const courses=state.courses.filter(c=>`${c.title} ${c.description||''}`.toLowerCase().includes(q));$('page-courses').hidden=false;document.querySelectorAll('.page').forEach(el=>{if(el.id!=='page-courses')el.hidden=true;});$('pageTitle').textContent='Search results';$('allCourses').innerHTML=courses.map(courseCard).join('')+matches.map(l=>`<article class="course-card"><div class="course-top"><div class="course-icon">▶</div><span class="level-tag">Lesson</span></div><h3>${esc(l.title)}</h3><p>${esc(l.description||l.subfolder||'Learning resource')}</p><button class="btn btn-quiet" data-open-lesson="${l.id}">Open lesson →</button></article>`).join('')||empty('No matching courses or lessons.');}
  function toggleTheme(){state.theme=state.theme==='dark'?'light':'dark';localStorage.setItem('wn_lms_theme',state.theme);applyTheme();}
  function applyTheme(){document.body.classList.toggle('dark',state.theme==='dark');}
  function toggleLanguage(){state.lang=state.lang==='en'?'si':'en';localStorage.setItem('wn_lms_lang',state.lang);document.querySelectorAll('.nav-item[data-page]').forEach(btn=>{const map={home:text[state.lang].overview,courses:text[state.lang].courses,bookmarks:text[state.lang].bookmarks,results:text[state.lang].results,announcements:text[state.lang].announcements,admin:text[state.lang].admin};const icon=btn.querySelector('span')?.outerHTML||'';btn.innerHTML=icon+' '+(map[btn.dataset.page]||btn.textContent.trim());});toast(state.lang==='si'?'භාෂාව සිංහලට මාරු කළා.':'Language set to English.','success');}
  function debounce(fn,ms){let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),ms);};}

  window.addEventListener('error',e=>console.error('WenodoSL LMS error',e.error||e.message));
  document.addEventListener('DOMContentLoaded',init);
})();
