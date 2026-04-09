/**
 * Notepad App — Local Storage-backed note manager
 */
(() => {
  'use strict';

  // ===== DOM Elements =====
  const $ = (sel) => document.querySelector(sel);
  const notesList = $('#notes-list');
  const noteTitle = $('#note-title');
  const noteBody = $('#note-body');
  const editorContainer = $('#editor-container');
  const emptyState = $('#empty-state');
  const saveStatus = $('#save-status');
  const charCount = $('#char-count');
  const wordCount = $('#word-count');
  const lastModified = $('#last-modified');
  const noteCount = $('#note-count');
  const searchInput = $('#search-input');
  const sidebar = $('#sidebar');
  const sidebarToggle = $('#sidebar-toggle');
  const deleteModal = $('#delete-modal');

  // ===== State =====
  const STORAGE_KEY = 'notepad_notes';
  let notes = [];
  let activeNoteId = null;
  let saveTimeout = null;
  let pendingDeleteId = null;

  // ===== Helpers =====
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;

    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }

  function getPreview(body) {
    const text = (body || '').replace(/\n/g, ' ').trim();
    return text.length > 80 ? text.slice(0, 80) + '…' : text || 'No content';
  }

  // ===== Persistence =====
  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      notes = raw ? JSON.parse(raw) : [];
    } catch {
      notes = [];
    }
  }

  function saveNotes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  // ===== Rendering =====
  function renderNotesList(filter = '') {
    const query = filter.toLowerCase();
    const filtered = query
      ? notes.filter(
          (n) =>
            n.title.toLowerCase().includes(query) ||
            n.body.toLowerCase().includes(query)
        )
      : notes;

    // Sort by last modified
    filtered.sort((a, b) => b.updatedAt - a.updatedAt);

    notesList.innerHTML = '';

    filtered.forEach((note) => {
      const el = document.createElement('div');
      el.className = 'note-item' + (note.id === activeNoteId ? ' active' : '');
      el.dataset.id = note.id;

      el.innerHTML = `
        <div class="note-item-content">
          <div class="note-item-title">${escapeHtml(note.title || 'Untitled')}</div>
          <div class="note-item-preview">${escapeHtml(getPreview(note.body))}</div>
          <div class="note-item-date">${formatDate(note.updatedAt)}</div>
        </div>
        <button class="note-item-delete" title="Delete note" aria-label="Delete note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      `;

      // Click on content area to select note
      el.querySelector('.note-item-content').addEventListener('click', () => selectNote(note.id));

      // Click delete button to open delete modal for this note
      el.querySelector('.note-item-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteModal(note.id);
      });

      notesList.appendChild(el);
    });

    noteCount.textContent = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function updateEditorStats() {
    const text = noteBody.value;
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;

    charCount.textContent = `${chars} character${chars !== 1 ? 's' : ''}`;
    wordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;

    const note = notes.find((n) => n.id === activeNoteId);
    if (note) {
      lastModified.textContent = `Modified ${formatDate(note.updatedAt)}`;
    }
  }

  function showEditor() {
    editorContainer.classList.add('visible');
    emptyState.classList.add('hidden');
  }

  function showEmpty() {
    editorContainer.classList.remove('visible');
    emptyState.classList.remove('hidden');
  }

  // ===== Note Operations =====
  function createNote() {
    const note = {
      id: generateId(),
      title: '',
      body: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    notes.unshift(note);
    saveNotes();
    selectNote(note.id);
    renderNotesList(searchInput.value);
    noteTitle.focus();

    // Close sidebar on mobile
    sidebar.classList.remove('open');
  }

  function selectNote(id) {
    activeNoteId = id;
    const note = notes.find((n) => n.id === id);
    if (!note) return;

    noteTitle.value = note.title;
    noteBody.value = note.body;
    showEditor();
    updateEditorStats();
    renderNotesList(searchInput.value);

    // Close sidebar on mobile
    sidebar.classList.remove('open');
  }

  function updateActiveNote() {
    const note = notes.find((n) => n.id === activeNoteId);
    if (!note) return;

    note.title = noteTitle.value;
    note.body = noteBody.value;
    note.updatedAt = Date.now();

    // Show saving indicator
    saveStatus.textContent = 'Saving…';
    saveStatus.classList.add('saving');

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveNotes();
      renderNotesList(searchInput.value);
      updateEditorStats();
      saveStatus.textContent = 'Saved';
      saveStatus.classList.remove('saving');
    }, 400);
  }

  function deleteNote(id) {
    const wasActive = id === activeNoteId;
    notes = notes.filter((n) => n.id !== id);
    saveNotes();

    if (wasActive) {
      activeNoteId = null;
      if (notes.length > 0) {
        selectNote(notes[0].id);
      } else {
        showEmpty();
      }
    }

    renderNotesList(searchInput.value);
    closeDeleteModal();
  }

  // ===== Modal =====
  function openDeleteModal(id) {
    pendingDeleteId = id || activeNoteId;
    deleteModal.classList.add('visible');
  }

  function closeDeleteModal() {
    deleteModal.classList.remove('visible');
    pendingDeleteId = null;
  }

  // ===== Event Listeners =====
  $('#btn-new-note').addEventListener('click', createNote);
  $('#btn-empty-new').addEventListener('click', createNote);
  $('#btn-delete-note').addEventListener('click', () => openDeleteModal(activeNoteId));
  $('#btn-confirm-delete').addEventListener('click', () => {
    if (pendingDeleteId) deleteNote(pendingDeleteId);
  });
  $('#btn-cancel-delete').addEventListener('click', closeDeleteModal);

  noteTitle.addEventListener('input', updateActiveNote);
  noteBody.addEventListener('input', updateActiveNote);

  searchInput.addEventListener('input', (e) => {
    renderNotesList(e.target.value);
  });

  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (
      window.innerWidth <= 768 &&
      sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      !sidebarToggle.contains(e.target)
    ) {
      sidebar.classList.remove('open');
    }
  });

  // Close modal on overlay click
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + N → new note
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      createNote();
    }
    // Escape → close modal
    if (e.key === 'Escape') {
      closeDeleteModal();
    }
  });

  // ===== Init =====
  loadNotes();
  renderNotesList();

  if (notes.length > 0) {
    selectNote(notes[0].id);
  } else {
    showEmpty();
  }
})();
