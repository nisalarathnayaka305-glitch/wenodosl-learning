# WenodoSL Learning Hub — GitHub Pages + Supabase

මෙය දැනට තිබෙන WenodoSL Booking Apps Script එකෙන් වෙන්ව ක්‍රියාත්මක වන Learning Hub starter project එකකි.

## මේ package එකේ තියෙන්නේ

- Supabase Email/Password login සහ password reset
- LMS Admin / Super Admin roles
- Courses, levels, deadlines
- Learning lessons සහ external video/document links
- Lesson completion progress
- Bookmarks
- Randomized MCQ / written quizzes (server-side answer checking)
- Quiz attempt history සහ score summary
- Announcements
- Course completion certificate (lessons complete + published quizzes 70% pass)
- Learner invitations සඳහා Supabase Edge Function
- PWA manifest/service worker
- පැරණි Google Sheets LMS content migrate කිරීම සඳහා exporter සහ import script

**සටහන:** GitHub Pages static hosting එකයි. Authentication, database, quiz grading සියල්ල Supabase වෙතින් වේ. Learning requests Apps Script හරහා නොයන නිසා Booking Apps Script quota එක භාවිත නොකරයි.

---

## 1. Supabase project එක හදන්න

1. https://supabase.com/dashboard වෙත ගොස් New project එකක් හදන්න.
2. Project එක create වූ පසු **SQL Editor → New query** යන්න.
3. `supabase/schema.sql` file එකේ සියලු SQL copy කර Run කරන්න.
4. **Project Settings → API** වෙතින් Project URL සහ `anon` / publishable key එක copy කරගන්න.
5. `config.js` file එකේ values දෙක පුරවන්න:

```js
window.WENODO_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_ANON_PUBLIC_KEY'
};
```

`anon` / publishable key එක browser එකේ තිබීම සාමාන්‍යයි. **`service_role` key එක කිසිවිටෙක `config.js`, GitHub repository හෝ frontend code එකට දාන්න එපා.** Database access එක RLS policies මගින් පාලනය වේ.

## 2. පළමු Super Admin account එක හදන්න

1. Supabase Dashboard → Authentication → Users වෙත යන්න.
2. Add user / Invite user භාවිත කර ඔබගේ admin email එකට account එකක් හදන්න.
3. එම account එකෙන් Learning Hub එකට පළමු වරට sign in වන්න. `profiles` row එක trigger එකෙන් auto-create වේ.
4. Supabase SQL Editor එකේ පහත query එක ඔබගේ admin email එකට වෙනස් කර Run කරන්න:

```sql
update public.profiles
set role = 'super_admin'
where email = 'your-admin-email@example.com';
```

මෙම පියවරෙන් පසුව Admin tools menu එක පෙනේ.

## 3. Email invitation function deploy කරන්න

මෙය LMS Admin කෙනෙකුට learner account එකකට invitation email යැවීමට භාවිත වේ. Frontend එකේ service-role key එකක් නැත.

Supabase CLI install/login කර project එක link කළ පසු project root එකෙන්:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase functions deploy admin-create-user
```

Supabase Edge Functions runtime එකට `SUPABASE_URL` සහ `SUPABASE_ANON_KEY` secrets ලෙස ලබාදෙන්න අවශ්‍ය නම්:

```bash
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

**Service role key එක local terminal/Supabase secret store එකට පමණක් දෙන්න.** GitHub එකට push කරන්න එපා.

Supabase Dashboard → Authentication → URL Configuration තුළ:
- Site URL: ඔබගේ GitHub Pages URL
- Redirect URLs: `https://YOUR_GITHUB_NAME.github.io/YOUR_REPOSITORY/`

Email invitation/reset links හරි redirect වීමට මේක අවශ්‍යයි. Production භාවිතයට SMTP provider එකක් configure කිරීමත් නිර්දේශ කරමි.

## 4. GitHub Pages වෙත publish කරන්න

1. GitHub හි අලුත් repository එකක් හදන්න; උදා: `wenodosl-learning`.
2. මේ folder එකේ files repository root එකට upload/push කරන්න.
3. `config.js` එකේ Supabase URL සහ anon key values ඇතුළත් කර commit කරන්න. මේ key එක public browser key එකක් පමණයි; RLS අනිවාර්යයි.
4. Repository → **Settings → Pages** වෙත යන්න.
5. Build and deployment: **Deploy from a branch** තෝරන්න.
6. Branch: `main`, Folder: `/ (root)` තෝරා Save කරන්න.
7. GitHub Pages URL එක open කර login test කරන්න.

Local preview එකක් සඳහා `python -m http.server 8000` ධාවනය කර `http://localhost:8000` open කරන්න. `file://` ලෙස double-click කර open නොකරන්න.

## 5. Google Sheets LMS data migrate කිරීම

### 5.1 Export

1. Original WenodoSL Apps Script project එකේ `migration/ExportLearningData.gs` code එක අලුත් `.gs` file එකකට paste කරන්න.
2. `SOURCE_SPREADSHEET_ID` නිවැරදිද බලන්න.
3. Apps Script editor එකෙන් `exportWenodoLearningDataForSupabase` function එක එක වරක් run කර permissions දෙන්න.
4. Google Drive හි `WenodoSL-LMS-Migration` folder එකේ JSON export එක සොයා download කරන්න.

Exporter එක පහත content export කරයි: `LMS`, `Questions`, `QuizBank`, `OpenEndedQuizBank`, `QuizSettings`, සහ `Users` sheet එකෙන් username/email/name/role පමණයි.

**PasswordHash, Salt, Photo, Session tokens export කරන්නේ නැහැ.** පැරණි password hash එක Supabase Auth වෙත සෘජුව import නොකරන්න. Learners ට Supabase invitation/reset link හරහා password set කරවන්න.

### 5.2 Import

Node.js 18+ install කර මේ project folder එකේ terminal එකෙන්:

```bash
npm install
```

`.env.example` copy කර `.env` නමින් save කර values පුරවන්න:

```env
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

ඊට පස්සේ:

```bash
node migration/import-learning-data.mjs ./path-to-export.json
```

Import script එක courses, lessons, quiz forms, MCQ/written question banks සහ දැනට Supabase Auth තුළ තිබෙන user profiles map කරයි. Supabase account එකක් තවම නැති users සඳහා `missing-learning-users.csv` file එකක් හදයි. ඒ අයට Admin tools → Invite learner හෝ Supabase Auth invitations භාවිත කරන්න.

**මෙම පළමු importer එක පැරණි QuizResults history / written-answer history migrate නොකරයි.** පරණ spreadsheet එක backup/archive එකක් ලෙස තබාගන්න. Migration verify කරන තුරු original Sheets කිසිවක් delete කරන්න එපා.

## 6. Learning Users Sheet ගැන වැදගත් සටහන

ඔබ upload කළ original source code එකේ `verifyUserLogin()` function එක login credentials `Users` sheet එකෙන් පරීක්ෂා කරයි. `LearningAccess` sheet එක භාවිත කරන්නේ Learning Hub එකට පැමිණි අයගේ recent-access log එකක් තබාගැනීමට පමණයි; එය login database එකක් නොවේ.

ඔබගේ production system එකේ වෙනම **Learning Users** spreadsheet/tab එකක් තිබේ නම්, ඒකේ column headings/CSV එකත් අවශ්‍යයි. එවිට importer එක ඒ user list එකට ගැළපෙන ලෙස වෙනස් කළ හැකියි.

## Security checklist

- [ ] `schema.sql` run කර RLS enabled බව තහවුරු කරන්න.
- [ ] පළමු Super Admin role එක SQL Editor හරහා පමණක් assign කරන්න.
- [ ] Public sign-up අවශ්‍ය නැත්නම් Supabase Auth settings තුළ disable කරන්න; invitation flow භාවිත කරන්න.
- [ ] `service_role` key එක frontend/GitHub වෙත නොයවන්න.
- [ ] Auth redirect URL සහ email provider configure කරන්න.
- [ ] Student account එකකින් login කර වෙනත් user progress/quiz answers කියවිය නොහැකි බව පරීක්ෂා කරන්න.
- [ ] Admin account එකෙන් course/lesson/quiz creation පරීක්ෂා කරන්න.
- [ ] 5 → 20 → 50 → 100 users staged load test කරලා පසුව 200-user test කරන්න.

## සීමාවන් / ඊළඟ අදියර

මෙම package එක core LMS migration + foundation එකකි. Discussion forum, email reminders, full admin written-answer grading screen, quiz analytics graphs/leaderboard, bulk user import UI, AI assistant/AI quiz generator, multi-language content translation සහ full video-provider playback-position tracking තවම UI එකට සම්පූර්ණයෙන් සම්බන්ධ කර නැත. ඒවා වෙනම phases ලෙස එකතු කළ යුතුයි. External YouTube/Drive embeds සඳහා playback position එක provider API එකක් නැතිව විශ්වාසදායකව ලබාගත නොහැක; දැනට lesson completion manual ලෙස mark කරයි.

## 7. දැනට තිබෙන WenodoSL Booking website එකෙන් Learning Hub open කිරීම

GitHub Pages site එක publish කර URL එක ලැබුණු පසු, original `Index.html` file එකේ Learning Hub navigation button එක external link එකක් කරන්න. Original button එකේ `onclick="setView('learning')"` වෙනුවට පහත URL එක දාන්න:

```html
<button class="nav-btn" onclick="window.open('https://YOUR_GITHUB_NAME.github.io/YOUR_REPOSITORY/','_blank','noopener')">
  <i class="fa-solid fa-graduation-cap"></i><span>Learning Hub</span>
</button>
```

මෙය වෙනම tab එකක Learning Hub open කරයි. Booking backend එක Nisala Apps Script project එකේම පවතින අතර Learning backend calls Supabase වෙත යයි.
