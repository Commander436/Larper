/*
 * Onboarding flow, driven by the role chosen on the landing page.
 *   Mentor: topics -> title -> lessons -> about you -> location -> phone -> photo -> profile
 *   Mentee: interests -> photo -> profile
 * Progress is saved in localStorage ("tfw_profile") so refreshing doesn't lose work.
 * There is no backend yet: swap `saveProfile` for an API call later.
 */
(function () {
  // ---------- Config ----------
  const CONFIG = {
    maxTopics: 4,      // mentors: subjects they teach
    maxInterests: 6,   // mentees: subjects they want to learn
    photoRequired: true,
    photoMaxMB: 5,
    photoSize: 512,    // stored square size in px
    minTitleWords: 12,
    minLessonWords: 40,
    minAboutWords: 30,
  };

  const FLOWS = {
    mentor: ["topics", "title", "lessons", "about", "location", "phone", "photo"],
    mentee: ["topics", "photo"],
  };

  const COUNTRIES = [
    ["US", "🇺🇸", "+1", 10], ["CA", "🇨🇦", "+1", 10], ["MX", "🇲🇽", "+52", 10],
    ["GB", "🇬🇧", "+44", 10], ["IN", "🇮🇳", "+91", 10], ["PH", "🇵🇭", "+63", 10],
  ];

  // ---------- State ----------
  const blank = {
    role: "", step: 0, topics: [], title: "", lessons: "", about: "", photo: "",
    location: { house: false, travel: false, online: false, address: "", city: "", zip: "", miles: "" },
    phone: { country: "US", number: "" },
    complete: false,
  };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem("tfw_profile") || "null");
      return saved ? Object.assign({}, blank, saved, {
        location: Object.assign({}, blank.location, saved.location),
        phone: Object.assign({}, blank.phone, saved.phone),
      }) : structuredClone(blank);
    } catch (e) { return structuredClone(blank); }
  }
  function save() {
    try { localStorage.setItem("tfw_profile", JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // Must be signed in (see auth.js)
  try {
    if (!localStorage.getItem("tfw_session")) { window.location.replace("index.html"); return; }
  } catch (e) { /* storage blocked: allow preview */ }

  const state = load();
  if (state.complete) { window.location.replace("profile.html"); return; }
  if (!FLOWS[state.role]) { window.location.replace("index.html"); return; } // no role chosen yet
  const STEPS = FLOWS[state.role];
  const isMentor = state.role === "mentor";
  const maxPicks = isMentor ? CONFIG.maxTopics : CONFIG.maxInterests;
  if (state.step >= STEPS.length) state.step = 0;
  let topicPath = []; // current position in the topic tree (names)

  const stepEl = document.getElementById("step");
  const tipEl = document.getElementById("tip");
  const bar = document.getElementById("progress-bar");

  // ---------- Helpers ----------
  function h(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v; // only used with static, trusted strings
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => c != null && node.append(c.nodeType ? c : document.createTextNode(c)));
    return node;
  }
  const words = (s) => (s.trim().match(/\S+/g) || []).length;

  // Contact details / links are not allowed in public text
  function findContactInfo(text) {
    if (/https?:\/\/|www\.|\b[\w-]+\.(com|net|org|io|co|me)\b/i.test(text)) return "links or URLs";
    if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return "an email address";
    if (/(\+?\d[\s().-]?){9,}/.test(text)) return "a phone number";
    return null;
  }

  const ICONS = {
    smile: '<svg viewBox="0 0 24 24" fill="none" stroke="#dd5f17" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="9.5" r=".6" fill="#dd5f17"/><circle cx="15" cy="9.5" r=".6" fill="#dd5f17"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="#dd5f17" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  };

  // ---------- Tips (left panel) ----------
  const TIPS = {
    topics: { html: isMentor
      ? `<p>You can add up to ${CONFIG.maxTopics} subjects to your profile. Choose subjects you can teach or mentor in at the same time.</p>
         <p>Start with a broad area, then pick the specific topic you're strongest in.</p>`
      : `<p>Tell us what you'd like to learn. You can pick up to ${CONFIG.maxInterests} topics, and we'll use them to help match you with mentors.</p>
         <p>Not sure yet? Browse a few areas and choose what sounds fun. You can change these later.</p>` },
    photo: { html: `<p>A friendly photo helps ${isMentor ? "students and families feel comfortable getting in touch" : "your mentor recognize you and feel connected"}.</p>
      <ul><li>Use a clear, recent photo</li><li>${isMentor ? "Face the camera, good lighting" : "Any photo you're comfortable sharing"}</li><li>JPG, PNG or WebP, up to ${CONFIG.photoMaxMB} MB</li></ul>` },
    title: { html: `<p>Your title is the first thing students see. Make it unique, make it welcoming, and use at least ${CONFIG.minTitleWords} words to cover:</p>
      <ul><li>The subject you teach</li><li>Your experience and teaching approach</li><li>What sets you apart</li></ul>
      <div class="tip-label">👍 What works</div>
      <div class="example">Software engineer helps beginners learn Python and build their first website, patient and friendly, online or in person</div>
      <div class="example">College student teaches Scratch and Roblox game design to middle schoolers through fun, hands-on projects</div>` },
    lessons: { html: `<p>Explain your approach as a mentor and how you share your knowledge:</p>
      <ul><li>Your teaching method and techniques</li><li>A typical lesson plan</li><li>What sets you apart</li><li>Who the lessons are for (age, level, goals)</li></ul>
      <div class="tip-label">☕ Remember</div>
      <p>Keep contact details and links out of your text. Students reach you through the site.</p>` },
    about: { html: `<p>Inspire confidence, show your background, and reassure students and families that you're a great fit.</p>
      <p>This is one of the first things students will read about you, so double-check your spelling and grammar.</p>
      <div class="tip-label">☕ Remember</div>
      <p>Don't include contact information or links in this section.</p>` },
    location: { html: `<p>Your address is never shown on the site. It's only shared with students you've agreed to teach.</p>
      <ul><li><b>At your house:</b> host lessons at the address you give</li>
      <li><b>You can travel:</b> set the farthest you'd go to meet a student</li>
      <li><b>Online:</b> teach anyone, anywhere, by video call</li></ul>` },
    phone: { html: `<p>Please add your mobile number. We'll text you as soon as you get a lesson request.</p>` },
  };

  function renderTip(key) {
    tipEl.replaceChildren(
      h("h3", { html: ICONS.smile + " Good to know" }),
      h("div", { html: TIPS[key].html })
    );
  }

  // ---------- Navigation ----------
  function nav(canNext, onNext, nextLabel) {
    const back = h("button", { class: "btn btn-ghost", type: "button", onclick: goBack }, "Go back");
    const next = h("button", { class: "btn btn-primary", type: "button", id: "next-btn", onclick: onNext }, nextLabel || "Next");
    next.disabled = !canNext;
    return h("div", { class: "nav" }, back, next);
  }
  function goBack() {
    if (state.step === 0) { window.location.href = "index.html"; return; }
    state.step -= 1; save(); render();
  }
  function goNext() {
    if (state.step >= STEPS.length - 1) { finish(); return; }
    state.step += 1; save(); render();
  }
  function setNextEnabled(on) {
    const b = document.getElementById("next-btn");
    if (b) b.disabled = !on;
  }
  function finish() {
    state.complete = true; save();
    window.location.href = "profile.html";
  }

  // ---------- Step 1: topics ----------
  function nodeAt(path) {
    let list = window.TOPIC_TREE;
    for (const name of path) list = list.find((n) => n.name === name).children;
    return list;
  }
  function renderTopics() {
    const items = nodeAt(topicPath);
    const picked = state.topics;
    const shown = picked.map((p) => p.split(" › ").pop());

    const heading = h("h1", {}, isMentor ? "You teach " : "You want to learn ", h("em", {}, shown.length ? shown.join(", ") : "…"));

    const crumbs = h("div", { class: "crumbs" },
      h("button", { type: "button", onclick: () => { topicPath = []; render(); } }, "All topics"),
      ...topicPath.flatMap((name, i) => [
        h("span", {}, "›"),
        h("button", { type: "button", onclick: () => { topicPath = topicPath.slice(0, i + 1); render(); } }, name),
      ])
    );

    const list = h("div", { class: "options", role: "list" },
      items.map((item) => {
        if (item.children) {
          return h("button", { class: "opt", type: "button", onclick: () => { topicPath = [...topicPath, item.name]; render(); } },
            item.name, h("span", { class: "chev", html: ICONS.chev }));
        }
        const full = [...topicPath, item.name].join(" › ");
        const on = picked.includes(full);
        return h("button", {
          class: "opt" + (on ? " selected" : ""), type: "button", "aria-pressed": on ? "true" : "false",
          onclick: () => toggleTopic(full),
        }, item.name, h("span", { class: "box", html: ICONS.check }));
      })
    );

    const chips = h("div", { class: "chips" },
      picked.map((p) => h("button", { class: "chip", type: "button", title: p, onclick: () => toggleTopic(p) }, p.split(" › ").pop())));
    const hint = h("p", { class: "hint" }, `${picked.length} of ${maxPicks} selected`);

    stepEl.replaceChildren(heading, crumbs, list, chips, hint, nav(picked.length > 0, goNext));
  }
  function toggleTopic(full) {
    const i = state.topics.indexOf(full);
    if (i >= 0) state.topics.splice(i, 1);
    else if (state.topics.length < maxPicks) state.topics.push(full);
    else { alert(`You can choose up to ${maxPicks} topics.`); return; }
    save(); render();
  }

  // ---------- Steps 2-4: text steps ----------
  function renderText(opts) {
    const { key, title, label, min, rows, placeholder } = opts;
    const area = h(rows === 1 ? "textarea" : "textarea", {
      class: "field", id: "text-input", rows: rows, placeholder: placeholder || "", "aria-describedby": "text-hint",
    });
    area.value = state[key];
    const counter = h("span", { class: "counter", "aria-live": "polite" }, "0");
    const hint = h("p", { class: "hint", id: "text-hint" }, "");
    const heading = h("h1", {}, title, h("small", {}, `(${min} minimum words)`));

    function validate(showErrors) {
      const text = area.value;
      const n = words(text);
      state[key] = text; save();
      counter.textContent = n >= min ? "✓" : String(n);
      counter.classList.toggle("ok", n >= min);
      const contact = findContactInfo(text);
      let ok = n >= min && !contact;
      hint.textContent = contact
        ? `Please remove ${contact}. Contact details and links aren't allowed here.`
        : (n < min && showErrors ? `${min - n} more word${min - n === 1 ? "" : "s"} to go.` : "");
      area.classList.toggle("invalid", !!contact);
      setNextEnabled(ok);
      return ok;
    }
    area.addEventListener("input", () => validate(true));

    stepEl.replaceChildren(heading, h("div", { class: "field-wrap" }, counter, area), hint, nav(false, () => validate(true) && goNext()));
    validate(false);
  }

  // ---------- Step 5: location ----------
  function renderLocation() {
    const L = state.location;
    const mk = (key, label, extra) => {
      const row = h("button", {
        class: "opt" + (L[key] ? " selected" : ""), type: "button", "aria-pressed": L[key] ? "true" : "false",
        onclick: () => { L[key] = !L[key]; save(); renderLocation(); },
      }, label, h("span", { class: "box", html: ICONS.check }));
      const box = extra ? h("div", { class: "opt-extra" + (L[key] ? " open" : "") }, extra) : null;
      return [row, box];
    };
    const bind = (id, prop, ph, type) => h("input", {
      class: "field", id, type: type || "text", placeholder: ph, value: L[prop] || "",
      oninput: (e) => { L[prop] = e.target.value; save(); recompute(); },
    });

    const houseExtra = [
      h("label", { for: "addr" }, "Street address"), bind("addr", "address", "123 Main St", "text"),
      h("label", { for: "city" }, "City"), bind("city", "city", "Phoenix"),
      h("label", { for: "zip" }, "ZIP code"), bind("zip", "zip", "85001"),
    ];
    const travelExtra = [
      h("label", { for: "miles" }, "Maximum distance you can travel (miles)"),
      bind("miles", "miles", "e.g. 15", "number"),
    ];

    const [r1, b1] = mk("house", "At your house", houseExtra);
    const [r2, b2] = mk("travel", "You can travel", travelExtra);
    const [r3] = mk("online", "Online");

    stepEl.replaceChildren(
      h("h1", {}, h("em", {}, "Location"), " of your lessons"),
      h("h2", { class: "q" }, "Where will the lesson take place?"),
      h("div", { class: "options" }, r1, b1, r2, b2, r3),
      nav(locationValid(), goNext)
    );
    function recompute() { setNextEnabled(locationValid()); }
  }
  function locationValid() {
    const L = state.location;
    if (!(L.house || L.travel || L.online)) return false;
    if (L.house && !(L.address.trim() && L.city.trim() && /^\d{5}(-\d{4})?$/.test(L.zip.trim()))) return false;
    if (L.travel && !(Number(L.miles) > 0)) return false;
    return true;
  }

  // ---------- Step 6: phone ----------
  function phoneDigits() { return state.phone.number.replace(/\D/g, ""); }
  function phoneValid() {
    const c = COUNTRIES.find((x) => x[0] === state.phone.country);
    return phoneDigits().length === c[3];
  }
  function renderPhone() {
    const select = h("select", { "aria-label": "Country code", onchange: (e) => { state.phone.country = e.target.value; save(); setNextEnabled(phoneValid()); } },
      COUNTRIES.map(([code, flag, dial]) => h("option", { value: code, selected: code === state.phone.country }, `${flag} ${dial}`)));
    const input = h("input", {
      type: "tel", id: "phone", inputmode: "tel", autocomplete: "tel-national", placeholder: "Mobile number",
      value: state.phone.number,
      oninput: (e) => { state.phone.number = e.target.value; save(); setNextEnabled(phoneValid()); },
    });
    stepEl.replaceChildren(
      h("h1", {}, h("em", {}, "Telephone"), " number"),
      h("p", { class: "label-muted" }, "Your telephone number"),
      h("p", { class: "label-sub" }, "Your number never appears on the site. It's only sent to the students you accept to teach."),
      h("div", { class: "phone" }, select, input),
      nav(phoneValid(), goNext)
    );
  }


  // ---------- Photo step ----------
  // Resizes to a square on a canvas so we store a small image (~50-100 KB),
  // not a multi-megabyte original. Swap for a real upload (e.g. object storage) later.
  function processPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error("Please choose a JPG, PNG or WebP image."));
      if (file.size > CONFIG.photoMaxMB * 1024 * 1024) return reject(new Error(`That file is too large. Max ${CONFIG.photoMaxMB} MB.`));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const n = CONFIG.photoSize, side = Math.min(img.width, img.height);
        const c = document.createElement("canvas"); c.width = c.height = n;
        c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, n, n);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("We couldn't read that image. Try another one.")); };
      img.src = url;
    });
  }
  function renderPhoto() {
    const avatar = h("div", { class: "avatar", role: "img", "aria-label": "Profile photo preview" }, state.photo ? "" : "📷");
    if (state.photo) avatar.style.backgroundImage = `url(${state.photo})`;
    const msg = h("p", { class: "hint", id: "photo-msg", role: "alert" }, "");
    const input = h("input", { type: "file", id: "photo-input", accept: "image/jpeg,image/png,image/webp", class: "sr-only" });
    const choose = h("button", { class: "btn btn-primary", type: "button", onclick: () => input.click() }, state.photo ? "Choose a different photo" : "Upload a photo");
    const actions = h("div", { class: "photo-actions" }, choose,
      state.photo ? h("button", { class: "btn btn-ghost", type: "button", onclick: () => { state.photo = ""; save(); renderPhoto(); } }, "Remove") : null);
    const drop = h("div", { class: "photo-drop" }, avatar, actions, h("p", {}, "or drag and drop an image here"));

    async function take(file) {
      if (!file) return;
      try {
        state.photo = await processPhoto(file); save(); renderPhoto();
      } catch (err) { msg.textContent = err.message; }
    }
    input.addEventListener("change", () => take(input.files[0]));
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", (e) => take(e.dataTransfer.files[0]));

    stepEl.replaceChildren(
      h("h1", {}, "Add your ", h("em", {}, "profile photo")),
      drop, input, msg,
      nav(!CONFIG.photoRequired || !!state.photo, goNext, "Finish")
    );
  }

  // ---------- Render ----------
  function render() {
    const key = STEPS[state.step];
    renderTip(key);
    bar.style.width = ((state.step + 1) / (STEPS.length + 1)) * 100 + "%";
    window.scrollTo({ top: 0 });
    if (key === "topics") renderTopics();
    else if (key === "title") renderText({ key: "title", title: h("span", {}, h("em", {}, "Title"), " of your ad"), min: CONFIG.minTitleWords, rows: 4 });
    else if (key === "lessons") renderText({ key: "lessons", title: h("span", {}, "About ", h("em", {}, "your lessons")), min: CONFIG.minLessonWords, rows: 9 });
    else if (key === "about") renderText({ key: "about", title: h("span", {}, "About ", h("em", {}, "you")), min: CONFIG.minAboutWords, rows: 9 });
    else if (key === "location") renderLocation();
    else if (key === "phone") renderPhone();
    else if (key === "photo") renderPhoto();
  }

  render();
})();
