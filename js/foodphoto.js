const FoodPhoto = (() => {
  // Long edge sent for analysis. Keeps uploads small (well under Vercel's
  // 4.5 MB body limit) while leaving plenty of detail to identify food.
  const MAX_EDGE = 1568;
  const JPEG_QUALITY = 0.82;

  let rows = [];
  let busy = false;

  function setStatus(text, isError) {
    const el = document.getElementById('photoStatus');
    el.textContent = text || '';
    el.hidden = !text;
    el.classList.toggle('error', !!isError);
    el.classList.toggle('muted', !isError);
  }

  async function loadImage(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (e) { /* fall through to <img> decoding */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be opened as a photo.')); };
      img.src = url;
    });
  }

  // Downscale and re-encode as JPEG. Returns a data URL.
  async function prepareImage(file) {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    if (img.close) img.close();
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  }

  async function analyze(dataUrl) {
    let auth = null;
    try { auth = JSON.parse(localStorage.getItem('fd_auth') || 'null'); } catch (e) {}
    let res;
    try {
      res = await fetch('/api/analyze-food', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(auth && auth.token) || ''}`
        },
        body: JSON.stringify({ image: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' })
      });
    } catch (e) {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || !data) throw new Error((data && data.error) || 'Photo analysis failed. Try again.');
    return data;
  }

  async function handleFile(file) {
    if (!file || busy) return;
    busy = true;
    document.getElementById('photoBtn').disabled = true;
    closeReview();
    setStatus('Looking at your photo…');
    try {
      const dataUrl = await prepareImage(file);
      const result = await analyze(dataUrl);
      if (!result.items || result.items.length === 0) {
        setStatus(result.notes || 'No food found in that photo. Try another one.', true);
        return;
      }
      rows = result.items.map(it => ({ ...it }));
      document.getElementById('photoThumb').src = dataUrl;
      const notesEl = document.getElementById('photoNotes');
      notesEl.textContent = result.notes || '';
      notesEl.hidden = !result.notes;
      renderRows();
      document.getElementById('photoReview').hidden = false;
      setStatus('');
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      busy = false;
      document.getElementById('photoBtn').disabled = false;
    }
  }

  function renderRows() {
    const body = document.getElementById('photoTableBody');
    body.innerHTML = '';
    rows.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="pr-name"><input type="text" aria-label="Food" value="${escapeHtml(row.name)}" data-field="name" data-idx="${idx}"></td>
        <td class="pr-portion"><input type="text" aria-label="Portion" placeholder="Portion" value="${escapeHtml(row.portion)}" data-field="portion" data-idx="${idx}"></td>
        <td data-label="kcal"><input type="number" min="0" value="${row.calories}" data-field="calories" data-idx="${idx}"></td>
        <td data-label="Protein"><input type="number" min="0" value="${row.protein}" data-field="protein" data-idx="${idx}"></td>
        <td data-label="Carbs"><input type="number" min="0" value="${row.carbs}" data-field="carbs" data-idx="${idx}"></td>
        <td data-label="Fat"><input type="number" min="0" value="${row.fat}" data-field="fat" data-idx="${idx}"></td>
        <td class="pr-remove"><button type="button" class="btn-danger" aria-label="Remove" data-remove="${idx}">&times;</button></td>
      `;
      body.appendChild(tr);
    });
    body.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', (e) => {
        const field = e.target.dataset.field;
        const isText = field === 'name' || field === 'portion';
        rows[Number(e.target.dataset.idx)][field] = isText ? e.target.value : (Number(e.target.value) || 0);
        renderTotals();
      });
    });
    body.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        rows.splice(Number(btn.dataset.remove), 1);
        renderRows();
      });
    });
    renderTotals();
  }

  function renderTotals() {
    const t = rows.reduce((acc, r) => {
      acc.calories += r.calories; acc.protein += r.protein; acc.carbs += r.carbs; acc.fat += r.fat;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
    document.getElementById('photoTotals').textContent =
      `Total: ${Math.round(t.calories)} kcal · ${Math.round(t.protein)} g protein · ${Math.round(t.carbs)} g carbs · ${Math.round(t.fat)} g fat`;
  }

  function confirmRows() {
    const items = rows
      .filter(r => r.name.trim())
      .map(r => ({
        name: r.portion.trim() ? `${r.name.trim()} (${r.portion.trim()})` : r.name.trim(),
        calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat
      }));
    if (items.length === 0) return;
    Calories.addEntries(items);
    closeReview();
  }

  function closeReview() {
    rows = [];
    document.getElementById('photoReview').hidden = true;
    document.getElementById('photoThumb').removeAttribute('src');
  }

  function init() {
    const input = document.getElementById('photoInput');
    document.getElementById('photoBtn').addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files[0];
      input.value = '';
      handleFile(file);
    });
    document.getElementById('photoAddRowBtn').addEventListener('click', () => {
      rows.push({ name: '', portion: '', calories: 0, protein: 0, carbs: 0, fat: 0 });
      renderRows();
    });
    document.getElementById('photoConfirmBtn').addEventListener('click', confirmRows);
    document.getElementById('photoCancelBtn').addEventListener('click', closeReview);
  }

  return { init };
})();
