# Learning Hub folder view and file upload migration

Run this SQL once in the Supabase SQL Editor for the project connected in config.js:
- Creates a private `learning-files` Storage bucket (25 MB per file).
- Allows learners to create signed URLs only for files attached to published lessons in published courses.
- Allows LMS Admin / Super Admin to upload, update and delete files.

Then deploy the GitHub Pages site from this branch. The Admin Tools → Add lesson / video form now accepts either a resource URL or a file upload. Course content can be browsed using Card View or Tree View, with Main Folder → Subfolder → Learning Material hierarchy.

Uploaded files are stored privately. The database stores a `storage://...` object path, not a public URL. Signed links are generated only when the lesson is opened.
