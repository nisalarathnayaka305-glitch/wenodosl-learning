import 'dotenv/config';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const file = process.argv[2];
if (!file) throw new Error('Usage: node migration/import-learning-data.mjs <export.json>');
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your local environment.');
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const source = JSON.parse(fs.readFileSync(file, 'utf8'));
const slug = value => String(value || 'General').trim().toLowerCase();
const typeMap = value => {
  const t=String(value||'').toLowerCase();
  if(t.includes('video'))return 'video'; if(t.includes('pdf'))return 'pdf'; if(t.includes('slide'))return 'slides'; if(t.includes('document')||t.includes('word'))return 'document'; return 'link';
};
async function must(query,label){const {data,error}=await query;if(error)throw new Error(`${label}: ${error.message}`);return data;}

console.log('Importing WenodoSL Learning content…');
const folders=[...new Set((source.lessons||[]).map(x=>x.folder||'General'))];
if(!folders.length)folders.push('General');
const courseByFolder=new Map();
for(const folder of folders){
  const row=await must(sb.from('courses').upsert({title:folder,description:'Imported from WenodoSL Learning Hub.',level:'All levels',is_published:true,legacy_folder:folder},{onConflict:'legacy_folder'}).select('id,title').single(),'course import');
  courseByFolder.set(folder,row.id);
}
for(let i=0;i<(source.lessons||[]).length;i++){
  const x=source.lessons[i],folder=x.folder||'General',courseId=courseByFolder.get(folder)||courseByFolder.values().next().value;
  const legacyKey=[folder,x.mainFolder,x.subfolder,x.link].join('|').toLowerCase();
  await must(sb.from('lessons').upsert({course_id:courseId,main_folder:x.mainFolder||'Lessons',subfolder:x.subfolder||'',title:x.title||x.filename||'Learning resource',description:'',content_type:typeMap(x.type),resource_url:x.link,is_published:true,legacy_key:legacyKey},{onConflict:'legacy_key'}),'lesson import');
}

const quizKeys=new Set();
(source.quizForms||[]).forEach(x=>quizKeys.add(x.subfolder));
(source.mcqQuestions||[]).forEach(x=>quizKeys.add(x.subfolder));
(source.writtenQuestions||[]).forEach(x=>quizKeys.add(x.subfolder));
const quizBySub=new Map();
for(const sub of quizKeys){
  const firstLesson=(source.lessons||[]).find(l=>slug(l.subfolder)===slug(sub));
  const folder=firstLesson?.folder||folders[0]||'General';
  const courseId=courseByFolder.get(folder)||courseByFolder.values().next().value;
  const form=(source.quizForms||[]).find(x=>slug(x.subfolder)===slug(sub));
  const setting=(source.quizSettings||[]).find(x=>slug(x.subfolder)===slug(sub));
  const quiz=await must(sb.from('quizzes').upsert({course_id:courseId,title:sub,description:'Imported quiz from WenodoSL.',time_limit_seconds:setting?.timeLimitSeconds||420,questions_per_attempt:10,max_attempts:0,is_published:true,external_url:form?.link||null,legacy_key:slug(sub)},{onConflict:'legacy_key'}).select('id,title').single(),'quiz import');
  quizBySub.set(slug(sub),quiz.id);
}
let importedQuestions=0;
for(const x of source.mcqQuestions||[]){
  const quizId=quizBySub.get(slug(x.subfolder));if(!quizId)continue;
  const written=String(x.correct||'').toUpperCase()==='OPEN';
  const legacyId='MCQ:'+(x.legacyId||`${slug(x.subfolder)}:${x.question}`);
  await must(sb.from('quiz_questions').upsert({quiz_id:quizId,question:x.question,question_type:written?'written':'mcq',options:written?[]:(x.options||['','','','']),correct_option:written?null:x.correct,explanation:x.explanation||'',marks:Number(x.marks)||1,difficulty:'Medium',legacy_id:legacyId,is_active:true},{onConflict:'legacy_id'}),'question import'); importedQuestions++;
}
for(const x of source.writtenQuestions||[]){
  const quizId=quizBySub.get(slug(x.subfolder));if(!quizId)continue;
  const legacyId='OPEN:'+(x.legacyId||`${slug(x.subfolder)}:${x.question}`);
  await must(sb.from('quiz_questions').upsert({quiz_id:quizId,question:x.question,question_type:'written',options:[],correct_option:null,model_answer:x.modelAnswer||'',marking_guide:x.markingGuide||'',explanation:x.markingGuide||'',marks:Number(x.marks)||1,difficulty:'Medium',legacy_id:legacyId,is_active:true},{onConflict:'legacy_id'}),'written question import'); importedQuestions++;
}

// Attach existing Supabase Auth accounts to the old employee directory by email.
// This does not import or reuse old password hashes. Missing accounts are reported for invitation.
const profiles=await must(sb.from('profiles').select('id,email'),'profile lookup');
const profileByEmail=new Map((profiles||[]).map(p=>[String(p.email||'').toLowerCase(),p.id]));
const missing=[];let updatedProfiles=0;
for(const old of source.users||[]){
  const id=profileByEmail.get(String(old.email||'').toLowerCase());
  if(!id){missing.push(old);continue;}
  const oldRole=String(old.legacyRole||'').toLowerCase();
  const role=oldRole==='super admin'?'super_admin':oldRole==='lms admin'?'lms_admin':'student';
  await must(sb.from('profiles').update({username:old.username||null,full_name:old.fullName||'',role}).eq('id',id),'profile mapping');
  updatedProfiles++;
}
if(missing.length){
  const csv=['username,email,full_name,legacy_role',...missing.map(x=>[x.username,x.email,x.fullName,x.legacyRole].map(v=>'"'+String(v||'').replaceAll('"','""')+'"').join(','))].join('\n');
  fs.writeFileSync('missing-learning-users.csv',csv);
}
console.log(`Done. Courses: ${folders.length}; lessons: ${(source.lessons||[]).length}; quizzes: ${quizKeys.size}; questions: ${importedQuestions}; matched user profiles: ${updatedProfiles}; users needing Supabase invitations: ${missing.length}.`);
if(missing.length)console.log('Created missing-learning-users.csv. Invite these people through the Learning Hub admin panel or Supabase Auth.');
console.log('Historical quiz results are not imported by this first migration script; keep the old QuizResults sheet as an archive.');
