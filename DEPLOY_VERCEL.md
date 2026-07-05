# MedScan AI — Vercel Deployment Guide (Frontend + Backend)

Aapke GitHub repo mein `frontend/` aur `backend/` do alag folders hain, isliye Vercel par
**do alag projects** banayenge — dono same repo se, bas "Root Directory" alag hoga.

---

## 0. Changes jo already kar diye gaye hain

- `backend/server.js` → Vercel par `/tmp/uploads` use karega (Vercel ka filesystem read-only
  hota hai, sirf `/tmp` writable hai), aur `app.listen()` sirf local mein chalega — Vercel
  par Express app export hota hai jise Vercel serverless function ki tarah run karta hai.
- `backend/vercel.json` → naya file, Express app ko serverless function bana deta hai.
- `frontend/medscan-ai.html` → `API_BASE` ke paas TODO comment add kiya hai, backend URL
  milne ke baad ye update karna hoga.

Ye saare changes commit + push karein:

```bash
git add .
git commit -m "Add Vercel deployment config for backend + frontend"
git push
```

---

## 1. Backend deploy (Vercel)

1. https://vercel.com/new par jaayein → apna GitHub repo import karein.
2. **Root Directory**: `backend`
3. Framework Preset: "Other"
4. Environment Variables (Project Settings → Environment Variables):
   - `GEMINI_API_KEY` = aapki Gemini API key (https://aistudio.google.com/app/apikey se)
5. Deploy pe click karein. Deploy hone ke baad aapko ek URL milega, jaise:
   `https://medscan-ai-backend.vercel.app`
6. Check karein: `https://medscan-ai-backend.vercel.app/api/health` khol ke dekhein —
   `{"success": true, ...}` aana chahiye.

### ⚠️ Zaroori limitation (honestly bata raha hoon)

- Vercel serverless functions har request ke liye ek fresh container use kar sakte hain,
  isliye image OCR (`tesseract.js`) har baar apni language data (~10-15MB) download karta
  hai — ye pehli request ko slow bana sakta hai, aur agar function timeout se zyada time
  le le to fail ho sakta hai.
- `vercel.json` mein `maxDuration: 60` set kiya hai, lekin Hobby (free) plan par by default
  10s hi allow hota hai jab tak "Fluid Compute" enabled na ho. Agar deploy ke baad
  bade image reports process karte waqt timeout error aaye, to Vercel dashboard mein
  Fluid Compute enable karein ya function duration settings check karein.
- PDF reports (`pdf-parse`) is issue se affect nahi hote — wo fast hain.
- Ye sab kaam karega kyunki frontend sirf ek hi endpoint (`/api/analyze-report`) use karta
  hai jo upload → OCR → parse → analyze → cleanup sab ek hi request mein kar deta hai
  (koi cross-request file state save nahi karna padta).

---

## 2. Frontend deploy (Vercel)

1. `medscan-ai.html` mein `API_BASE` ko backend ke actual URL se update karein:
   ```js
   const API_BASE = "https://medscan-ai-backend.vercel.app/api";
   ```
   Commit + push karein.
2. https://vercel.com/new par phir se jaayein → same repo import karein (ek naya project
   banega).
3. **Root Directory**: `frontend`
4. Framework Preset: "Other" (koi build step nahi chahiye, ye single HTML file hai)
5. Deploy karein. Aapko frontend ka URL milega, jaise:
   `https://medscan-ai-frontend.vercel.app`

---

## 3. Final check

- Frontend URL kholein → report upload karke test karein.
- Agar CORS error aaye, `backend/server.js` mein `cors()` ko frontend ke actual domain tak
  restrict kar sakte hain:
  ```js
  app.use(cors({ origin: "https://medscan-ai-frontend.vercel.app" }));
  ```

Bas — dono projects same GitHub repo se connected hain, isliye future mein jab bhi aap
`git push` karenge, Vercel automatically redeploy kar dega.
