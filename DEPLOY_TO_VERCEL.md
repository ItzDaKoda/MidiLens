# Deploy MidiLens to Vercel

This version is prepared for Vercel deployment.

## Local development

Start the backend:

```bash
cd backend
.venv\Scripts\Activate.ps1
python app.py
```

Start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend uses `/api/analyze`; Vite proxies that to the local Flask backend.

## Deploy

1. Push this project to GitHub.
2. Import the repository into Vercel.
3. Use these settings if Vercel does not auto-detect them:
   - Framework Preset: Vite
   - Root Directory: project root
   - Build Command: `cd frontend && npm install && npm run build`
   - Output Directory: `frontend/dist`
4. Deploy.

The Flask API is available through the root-level `api/app.py` serverless function.
