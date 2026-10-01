# Presenty

Presenty is an attendance workspace for creating class rosters, marking daily attendance, and reviewing saved records.

## Run locally

```bash
npm install
npm run dev
```

Create a class, add students and optional parent or guardian phone numbers, then mark attendance from **Today's attendance** by entering absent students separated by commas. History is a simple spreadsheet-style table with one row per student per saved date. Saving again on the same day updates that class's daily register; earlier dates remain separate. Class lists and attendance history are saved in this browser and do not automatically sync to another browser or device.

The Make custom webhook URL is configured in the frontend and is visible to anyone who can access the published app. Every attendance submission sends the class, each student's name, parent phone number, and present/absent status directly to Make. To notify parents, configure the Make scenario to filter absent students and connect an SMS or WhatsApp sending module; the webhook alone does not send messages.

## Webhook payload

When attendance is saved, Presenty sends a JSON `POST` request:

```json
{
  "event": "attendance_recorded",
  "source": "Presenty",
  "recordedAt": "current ISO timestamp",
  "class": { "id": "generated class id", "name": "Class name" },
  "attendance": {
    "date": "current local date",
    "totalStudents": 2,
    "presentStudents": 1,
    "absentStudents": ["Student name"],
    "status": "saved"
  },
  "students": [
    { "rollNumber": "01", "name": "Student name", "parentPhone": "+1 555 0100", "status": "absent" }
  ]
}
```

The app updates its local attendance history only after Make returns a successful `2xx` response. A failed request displays an error toast and keeps the form available for retry. Parent contact details are personal data; only enter numbers you are authorized to store and send to your Make scenario.

## Checks

```bash
npm run lint
npm run build
```

## Publish to GitHub

1. Create an empty GitHub repository.
2. Publish the Vite app using a static host that supports Vite builds.
3. Commit and push the project files.

For a static deployment, run `npm run build` and publish the generated `dist` directory.

## Make setup

Make must have an active **Webhooks > Custom webhook** trigger. Map each entry in the `students` array and filter for `status = absent` before sending a parent notification. If the webhook returns `401 Unauthorized`, regenerate or reactivate it and update the URL in `src/App.jsx`.
