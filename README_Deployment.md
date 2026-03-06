# QuestCast Deployment Guide

Enkel guide for å deploye QuestCast til Azure via GitHub.

git add . = Velg hvilke ingredienser/deler som skal med
git commit = Pakk i boks (lokal snapshot) 📦
git pull = Se hva som finnes på bordet fra før
git push = Send boksen fra PC → GitHub → Azure 🚀

---

## 🚀 Deployment (Kjør i rekkefølge)

### 1. Stage alle filer
```bash
git add .
```
**Hva skjer:** Markerer alle nye/endrede filer som "klare til commit"  
**Output:** Ingen (stille = vellykket)  
**Sjekk:** Kjør `git status` for å se "Changes to be committed"

---

### 📊 Forstå `git status` (Viktig!)

```bash
git status
```

**Output forklaring:**

```
On branch main                    ← Hvilken branch du er på
No commits yet                    ← Ingen commits laget ennå

Changes to be committed:          ← GRØNN: Filer klare til commit
  (use "git rm --cached <file>..." to unstage)
        new file:   server.js
        new file:   package.json

Changes not staged for commit:    ← RØD: Filer endret etter siste 'git add'
  (use "git add <file>..." to update what will be committed)
        modified:   README.md
```

**Hva betyr fargene:**

- **GRØNN (Changes to be committed)** = Filer som er **staged** og vil bli med i neste commit ✅
- **RØD (Changes not staged)** = Filer som er endret men **ikke staged** ennå ❌

**Hvis du ser rød:**
```bash
# Stage de røde filene også
git add .

# Sjekk igjen - nå skal alt være grønt
git status
```

**Når alt er grønt:** Du er klar til å committe! →

---

### 2. Commit filene (lager lokal "snapshot")
```bash
git commit -m "Add minimal Node.js Express app for Azure deployment"
```
**Hva skjer:** Lager en commit (permanent snapshot) av filene dine **lokalt på din maskin**  
**Output:** `[main (root-commit) abc1234] Add minimal Node.js...`  
**Viktig:** Dette er fortsatt bare på din PC, ikke på GitHub ennå!

---

### 3. Pull og merge med GitHub
```bash
git pull origin main --allow-unrelated-histories
```
**Hva skjer:** 
- Henter filer fra GitHub (workflow-filen som Azure lagde)
- Merger dem med dine lokale filer
- Flagget `--allow-unrelated-histories` trengs fordi GitHub og lokal har ulik historikk

**Mulige utfall:**

✅ **Ingen konflikter:** Du ser "Merge made by..." → Gå til steg 4

⚠️ **Merge-konflikter:** Du får melding om `CONFLICT in .gitignore` eller `README.md`

**Løs konflikter:**
1. Åpne filen(e) i VS Code (de vises med rødt merke)
2. Se konflikt-markører:
   ```
   <<<<<<< HEAD
   (din versjon)
   =======
   (GitHub sin versjon)
   >>>>>>> origin/main
   ```
3. Klikk på "Accept Current Change" / "Accept Incoming" / "Accept Both" i VS Code
4. Lagre filen
5. Avslutt merge:
   ```bash
   git add .
   git commit -m "Merge with GitHub workflow files"
   ```

---

### 4. Push til GitHub (synkroniser til sky)
```bash
git push origin main
```
**Hva skjer:** Sender alle dine commits til GitHub  
**Output:** `To https://github.com/Fiskepumper/QuestCast.git`  
**Viktig:** Dette **trigger automatisk GitHub Actions** som bygger og deployer til Azure!

✅ **Deployment starter nå automatisk!**

---

## 🔀 Jobbe med Branches (Flere features samtidig)

**Viktig:** Branches eksisterer ikke før du har laget minst én commit!  
Når du har kjørt `git commit` første gang, finnes `main` branch.

### Rutine FØR du begynner å kode:

```bash
# 1. ALLTID sjekk hvilken branch du er på
git status
# Første linje viser: "On branch main"

# ELLER
git branch
# Stjernen (*) viser aktiv branch:
#   * main
#     kristian/registration
```

```bash
# 2. Se status (er det ucommittede endringer?)
git status
```

```bash
# 3. Sørg for at main er oppdatert
git checkout main
git pull origin main
```

```bash
# 4. Lag ny branch for din feature
git checkout -b kristian/registration-form
# eller
git checkout -b kollega/database-setup
```

**Navnekonvensjon:** `navn/feature-beskrivelse` (f.eks. `kristian/wallet-integration`)

---

### Jobbe på din branch:

```bash
# Sjekk at du er på riktig branch (viktig!)
git branch
# * kristian/registration-form  ← Du er her

# Gjør endringer i koden...

# Stage endringer
git add .

# Commit
git commit -m "Add registration form with email validation"

# Push til GitHub (første gang du pusher denne branchen)
git push -u origin kristian/registration-form
```

**Hva er `-u`?**
- `-u` = "upstream" - kobler lokal branch til GitHub branch
- **Kun nødvendig FØRSTE gang** du pusher en ny branch
- Etter det kan du bare skrive `git push`

**Eksempel:**
```bash
# Første push av ny branch
git push -u origin kristian/registration-form
# Output: Branch 'kristian/registration-form' set up to track remote branch...

# Andre push (samme branch)
git push
# Git husker nå hvor den skal pushe!
```

**Push senere (når branch allerede finnes på GitHub):**
```bash
git push
# Ingen -u nødvendig - Git husker connection!
```

---

### Kollega jobber på sin branch:

```bash
# Kollega lager sin egen branch
git checkout main
git pull origin main
git checkout -b kollega/database-setup

# Gjør endringer...
git add .
git commit -m "Add PostgreSQL connection and schema"
git push -u origin kollega/database-setup
```

**Viktig:** Dere jobber nå helt uavhengig! Ingen konflikter.

---

### Merge til main når feature er klar:

**Alternativ 1: Via GitHub (anbefalt for team)**

1. Gå til GitHub.com → ditt repo
2. Klikk "Pull requests" → "New pull request"
3. Velg din branch (f.eks. `kristian/registration-form`)
4. Beskriv hva du har gjort
5. Kollega kan review og approve
6. Klikk "Merge pull request"
7. Azure deployer automatisk når merged til main!

**Alternativ 2: Lokalt (raskere, men mindre oversikt)**

```bash
# Bytt til main
git checkout main

# Pull siste endringer
git pull origin main

# Merge din feature-branch
git merge kristian/registration-form

# Push til GitHub (trigger Azure deploy)
git push origin main
```

---

### Sjekkliste: Unngå feil

**FØR du committer:**
- [ ] `git branch` eller `git status` - **Er jeg på riktig branch?**
  - Sikrer at du ikke committer til main ved et uhell
  - Stjernen (*) viser aktiv branch
- [ ] `git status` - **Hvilke filer endrer jeg?**
  - Sjekk at kun relevante filer er staged (grønn)

**FØR du pusher:**
- [ ] Er feature ferdig og testet lokalt? (`npm start` på localhost:3000)
- [ ] Bruker jeg `-u` hvis dette er første push av branchen?
  - `git push -u origin branch-navn` (første gang)
  - `git push` (senere pusher)

**FØR du merger til main:**
- [ ] Har kollega gjort endringer på main? (`git pull origin main`)
- [ ] Test at koden fungerer etter merge
- [ ] Sjekk at det ikke er konflikter

**Huskeregel:**
```
1. Sjekk branch → 2. Commit → 3. Push (-u første gang) → 4. Merge til main
```

---

### Nyttige kommandoer:

```bash
# Se alle branches (lokale og remote)
git branch -a

# Bytt mellom branches
git checkout main
git checkout kristian/registration-form

# Slett branch (etter merge)
git branch -d kristian/registration-form
git push origin --delete kristian/registration-form

# Se forskjell mellom din branch og main
git diff main

# Se commit-historikk
git log --oneline
```

---

## ✓ Verifisering

### Sjekk GitHub Actions
https://github.com/Fiskepumper/QuestCast → **Actions** tab → vent på grønn ✅

### Sjekk Azure Logs
Azure Portal → QuestCast → **Log stream** → se etter:
```
🚀 QuestCast server running on port 8080
```

### Test appen
Azure Portal → QuestCast → **Browse** 

Forventet: Lilla side med "🎯 QuestCast" heading

---

## 🐛 Feilsøking

**GitHub Actions rød?** → Sjekk workflow logs for feilmelding

**Azure viser fortsatt "default-static-site"?** → Restart App Service og vent 2-3 min

**Merge-konflikter vanskelig?** → Velg "Accept Both Changes" i VS Code

---

## 🔗 Lenker

- **GitHub:** https://github.com/Fiskepumper/QuestCast
- **Live site:** [Default domain fra Azure]

---

**Neste steg etter deployment:** 
Database-tilkobling + Registreringsskjema + Live deltakerliste
