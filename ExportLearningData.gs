/**
 * Run this one-time exporter from the original WenodoSL Apps Script project.
 * It exports learning content only. Password hashes, salts, photos and session tokens are NEVER exported.
 * Change SOURCE_SPREADSHEET_ID if your Learning tabs are in a different spreadsheet.
 */
const SOURCE_SPREADSHEET_ID = '1MuhlJQiTS2XAi2IcHyZywqlH9lFYpTJuLBo21phFDkA';

function exportWenodoLearningDataForSupabase() {
  const ss = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
  const data = {
    exportedAt: new Date().toISOString(),
    sourceSpreadsheetId: SOURCE_SPREADSHEET_ID,
    lessons: [], quizForms: [], mcqQuestions: [], writtenQuestions: [], quizSettings: [], users: []
  };

  const lms = ss.getSheetByName('LMS');
  if (lms && lms.getLastRow() > 1) {
    const values = lms.getDataRange().getDisplayValues();
    const rich = lms.getDataRange().getRichTextValues();
    let prev = { folder: '', main: '', sub: '' };
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      let link = row[3] || '';
      try { link = rich[i][3].getLinkUrl() || link; } catch (e) {}
      const iframeMatch = String(link).match(/src=[\"']([^\"']+)[\"']/i);
      if (iframeMatch) link = iframeMatch[1];
      if (row[0]) prev.folder = row[0].trim();
      if (row[1]) prev.main = row[1].trim();
      if (row[2]) prev.sub = row[2].trim();
      if (!/^https?:\/\//i.test(link)) continue;
      data.lessons.push({
        folder: prev.folder || 'General', mainFolder: prev.main || 'Lessons', subfolder: prev.sub || '',
        link: String(link).trim(), title: row[4] || row[5] || 'Learning resource',
        filename: row[5] || '', type: row[6] || ''
      });
    }
  }

  const forms = ss.getSheetByName('Questions');
  if (forms && forms.getLastRow() > 1) {
    const fr = forms.getRange(2, 1, forms.getLastRow() - 1, Math.min(2, forms.getLastColumn()));
    const fv = fr.getDisplayValues(), fRich = fr.getRichTextValues();
    fv.forEach((r, i) => {
      let link = r[1] || ''; try { link = fRich[i][1].getLinkUrl() || link; } catch (e) {}
      if (r[0] && /^https?:\/\//i.test(link)) data.quizForms.push({ subfolder: r[0].trim(), link: String(link).trim() });
    });
  }

  const qb = ss.getSheetByName('QuizBank');
  if (qb && qb.getLastRow() > 1) {
    qb.getRange(2, 1, qb.getLastRow() - 1, Math.min(12, qb.getLastColumn())).getValues().forEach(r => {
      if (!r[1] || !r[3]) return;
      data.mcqQuestions.push({ legacyId: String(r[0] || ''), subfolder: String(r[1]), title: String(r[2] || r[1]), question: String(r[3]), options: [r[4],r[5],r[6],r[7]].map(x => String(x || '')), correct: String(r[8] || '').trim().toUpperCase(), explanation: String(r[9] || ''), marks: Number(r[10]) || 1, createdOn: r[11] instanceof Date ? r[11].toISOString() : String(r[11] || '') });
    });
  }

  const open = ss.getSheetByName('OpenEndedQuizBank');
  if (open && open.getLastRow() > 1) {
    open.getRange(2, 1, open.getLastRow() - 1, Math.min(8, open.getLastColumn())).getDisplayValues().forEach(r => {
      if (!r[1] || !r[3]) return;
      data.writtenQuestions.push({ legacyId: String(r[0] || ''), subfolder: String(r[1]), title: String(r[2] || r[1]), question: String(r[3]), modelAnswer: String(r[4] || ''), markingGuide: String(r[5] || ''), marks: Number(r[6]) || 1 });
    });
  }

  const settings = ss.getSheetByName('QuizSettings');
  if (settings && settings.getLastRow() > 1) {
    settings.getRange(2, 1, settings.getLastRow() - 1, Math.min(3, settings.getLastColumn())).getDisplayValues().forEach(r => {
      if (r[0]) data.quizSettings.push({ subfolder: r[0], timeLimitSeconds: Number(r[1]) || 420 });
    });
  }

  // Safe account directory only: no password hashes, salts, photos or tokens.
  const users = ss.getSheetByName('Users');
  if (users && users.getLastRow() > 1) {
    users.getRange(2, 1, users.getLastRow() - 1, Math.min(7, users.getLastColumn())).getDisplayValues().forEach(r => {
      if (!r[0] || !r[2]) return;
      data.users.push({ username: String(r[0]), email: String(r[2]).toLowerCase().trim(), fullName: String(r[3] || ''), legacyRole: String(r[4] || 'Member') });
    });
  }

  const folderName = 'WenodoSL-LMS-Migration';
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  const filename = 'wenodosl-learning-export-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '.json';
  const file = folder.createFile(filename, JSON.stringify(data, null, 2), MimeType.PLAIN_TEXT);
  Logger.log('Export created: ' + file.getUrl());
  Logger.log('Lessons: ' + data.lessons.length + ', quiz forms: ' + data.quizForms.length + ', MCQ questions: ' + data.mcqQuestions.length + ', written questions: ' + data.writtenQuestions.length + ', user directory entries: ' + data.users.length);
  Logger.log('No passwords or password hashes were exported.');
}
