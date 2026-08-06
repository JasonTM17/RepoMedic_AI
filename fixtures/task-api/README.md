# Buggy Task API Fixture

This is an intentionally buggy Express API used for testing the RepoMedic system's bug triage capabilities.

Known bugs:

1. `nextId` starts at 0 instead of 1.
2. `getTask(id)` uses array index access instead of finding by id.
3. `POST /tasks` does not validate if `title` is missing.
4. `POST /tasks` returns HTTP 200 instead of 201 Created.
