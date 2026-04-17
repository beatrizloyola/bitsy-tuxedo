/* MUSIC TOOL
 * Groups the Tune editor, Blip editor, and Audio importer into a single "Music" panel.
 */

var audioFiles = {};
var nextAudioId = 0;
var musicTool = null;

// Maps roomId -> audioFileId for rooms that use an imported audio file as music.
// Lives here so save/load is co-located with audioFiles.
var roomAudioMap = {};

function makeMusicTool(tuneTool, blipTool) {
	// --- Panel root ---
	var musicPanel = document.createElement("div");
	musicPanel.id = "musicPanel";
	musicPanel.classList.add("bitsy-card", "bitsy-card-m", "bitsy-workbench-item");
	musicPanel.style.display = "none";

	// --- Titlebar ---
	var titlebar = document.createElement("div");
	titlebar.classList.add("bitsy-card-titlebar");

	var titleIconSpan = document.createElement("span");
	titleIconSpan.appendChild(createIconElement("note"));
	titlebar.appendChild(titleIconSpan);

	var titleSpan = document.createElement("span");
	titleSpan.classList.add("bitsy-card-title");
	titleSpan.innerText = "music";
	titleSpan.onmousedown = function(e) { grabCard(e); };
	titlebar.appendChild(titleSpan);

	titlebar.appendChild(createButtonElement({
		icon: "close",
		onclick: function() { hidePanel("musicPanel"); }
	}));
	musicPanel.appendChild(titlebar);

	// --- Main area ---
	var mainDiv = document.createElement("div");
	mainDiv.classList.add("bitsy-card-main", "music-panel-main");
	musicPanel.appendChild(mainDiv);

	// --- Tab bar ---
	var tabBar = document.createElement("div");
	tabBar.classList.add("music-tab-bar");
	mainDiv.appendChild(tabBar);

	var tabContents = {};
	var tabButtons = {};

	function switchTab(name) {
		for (var t in tabContents) {
			tabContents[t].style.display = (t === name) ? "" : "none";
			tabButtons[t].classList.toggle("music-tab-active", t === name);
		}
	}

	var tabDefs = [
		{ id: "tune",  icon: "tune",   label: "tune"  },
		{ id: "blip",  icon: "blip",   label: "blip"  },
		{ id: "audio", icon: "upload", label: "audio" },
	];

	for (var i = 0; i < tabDefs.length; i++) {
		(function(def) {
			var btn = createButtonElement({
				icon: def.icon,
				text: def.label,
				onclick: function() { switchTab(def.id); }
			});
			btn.classList.add("music-tab-btn");
			tabBar.appendChild(btn);
			tabButtons[def.id] = btn;

			var content = document.createElement("div");
			content.classList.add("music-tab-content");
			content.style.display = "none";
			mainDiv.appendChild(content);
			tabContents[def.id] = content;
		})(tabDefs[i]);
	}

	// --- Embed tune tool ---
	// Move the main content (nav, canvas, menu) from the tune card into the tune tab.
	// The canvas is already bound to the tune system — reparenting in DOM is safe.
	tabContents["tune"].appendChild(tuneTool.mainElement);
	if (tuneTool.rootElement.parentNode) {
		tuneTool.rootElement.parentNode.removeChild(tuneTool.rootElement);
	}

	// --- Embed blip tool ---
	tabContents["blip"].appendChild(blipTool.mainElement);
	if (blipTool.rootElement.parentNode) {
		blipTool.rootElement.parentNode.removeChild(blipTool.rootElement);
	}

	// --- Hide individual toolbar toggles for tune and blip ---
	var tuneCheckEl = document.getElementById("tuneCheck");
	if (tuneCheckEl && tuneCheckEl.parentElement) {
		tuneCheckEl.parentElement.style.display = "none";
	}
	var blipCheckEl = document.getElementById("blipCheck");
	if (blipCheckEl && blipCheckEl.parentElement) {
		blipCheckEl.parentElement.style.display = "none";
	}

	// --- Build audio tab ---
	buildAudioTab(tabContents["audio"]);

	// --- Add music panel to workspace ---
	document.getElementById("editorContent").appendChild(musicPanel);

	// --- Add single "music" toggle to toolbar ---
	document.getElementById("toolsPanel").insertBefore(
		createToggleElement({
			icon: "note",
			text: "music",
			id: "musicCheck",
			value: "musicPanel",
			style: "bitsy-tool-toggle",
			checked: false,
			onclick: function(e) { togglePanelAnimated(e); }
		}),
		document.getElementById("findCheck")
	);

	// --- Load persisted audio data ---
	loadAudioData();

	// --- Default to tune tab ---
	switchTab("tune");

	musicTool = { panel: musicPanel, switchTab: switchTab };
	return musicTool;
}

/* ---- Audio tab ---- */

function buildAudioTab(container) {
	var hint = document.createElement("p");
	hint.classList.add("audio-tab-hint");
	hint.innerText = "import songs and sound effects as audio files";
	container.appendChild(hint);

	// File input (hidden) + label as button
	var fileInput = document.createElement("input");
	fileInput.type = "file";
	fileInput.id = "audioFileInput";
	fileInput.accept = "audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a";
	fileInput.multiple = true;
	fileInput.style.display = "none";
	fileInput.onchange = function(e) {
		handleAudioImport(e.target.files);
		e.target.value = "";
	};
	container.appendChild(fileInput);

	var importLabel = document.createElement("label");
	importLabel.htmlFor = "audioFileInput";
	importLabel.classList.add("audio-import-btn");
	importLabel.title = "import audio files (mp3, wav, ogg, ...)";
	importLabel.appendChild(createIconElement("upload"));
	var importText = document.createElement("span");
	importText.innerText = "import audio";
	importLabel.appendChild(importText);
	container.appendChild(importLabel);

	var listContainer = document.createElement("div");
	listContainer.id = "audioFileList";
	listContainer.classList.add("audio-file-list");
	container.appendChild(listContainer);

	refreshAudioList();
}

function handleAudioImport(files) {
	var pending = files.length;
	if (pending === 0) return;

	for (var i = 0; i < files.length; i++) {
		(function(file) {
			if (!file.type.startsWith("audio/")) {
				alert('"' + file.name + '" doesn\'t seem to be an audio file.');
				if (--pending === 0) { saveAudioData(); refreshAudioList(); }
				return;
			}
			var reader = new FileReader();
			reader.onload = function(e) {
				var id = String(nextAudioId++);
				audioFiles[id] = {
					id:       id,
					name:     file.name.replace(/\.[^/.]+$/, ""),
					fileName: file.name,
					dataUrl:  e.target.result,
					type:     file.type,
				};
				if (--pending === 0) { saveAudioData(); refreshAudioList(); }
			};
			reader.onerror = function() {
				alert('Could not read "' + file.name + '".');
				if (--pending === 0) { saveAudioData(); refreshAudioList(); }
			};
			reader.readAsDataURL(file);
		})(files[i]);
	}
}

function refreshAudioList() {
	var listContainer = document.getElementById("audioFileList");
	if (!listContainer) return;

	while (listContainer.firstChild) {
		listContainer.removeChild(listContainer.firstChild);
	}

	var ids = Object.keys(audioFiles);
	if (ids.length === 0) {
		var emptyMsg = document.createElement("p");
		emptyMsg.classList.add("audio-empty-msg");
		emptyMsg.innerText = "no audio files yet";
		listContainer.appendChild(emptyMsg);
		return;
	}

	for (var i = 0; i < ids.length; i++) {
		(function(af) {
			var row = document.createElement("div");
			row.classList.add("audio-file-row");

			var nameInput = document.createElement("input");
			nameInput.type = "text";
			nameInput.value = af.name;
			nameInput.title = af.fileName;
			nameInput.classList.add("audio-file-name");
			nameInput.onchange = function() {
				af.name = nameInput.value.trim() || af.fileName;
				nameInput.value = af.name;
				audioFiles[af.id].name = af.name;
				saveAudioData();
			};
			row.appendChild(nameInput);

			var curAudio = null;

			var playBtn = createButtonElement({
				icon: "play",
				description: "preview: " + af.name,
				onclick: function() {
					if (curAudio) {
						curAudio.pause();
						curAudio.currentTime = 0;
					}
					curAudio = new Audio(af.dataUrl);
					curAudio.play();
				}
			});
			row.appendChild(playBtn);

			var stopBtn = createButtonElement({
				icon: "stop",
				description: "stop preview",
				onclick: function() {
					if (curAudio) {
						curAudio.pause();
						curAudio.currentTime = 0;
						curAudio = null;
					}
				}
			});
			row.appendChild(stopBtn);

			var deleteBtn = createButtonElement({
				icon: "delete",
				description: "remove " + af.name,
				onclick: function() {
					if (confirm('remove "' + af.name + '"?')) {
						if (curAudio) { curAudio.pause(); curAudio = null; }
						delete audioFiles[af.id];
						saveAudioData();
						refreshAudioList();
					}
				}
			});
			row.appendChild(deleteBtn);

			listContainer.appendChild(row);
		})(audioFiles[ids[i]]);
	}
}

function saveAudioData() {
	try {
		Store.set("audio_files", { files: audioFiles, nextId: nextAudioId, roomAudioMap: roomAudioMap });
	} catch(e) {
		console.warn("Could not save audio data:", e);
	}
}

function loadAudioData() {
	try {
		var saved = Store.get("audio_files");
		if (saved) {
			audioFiles = saved.files || {};
			nextAudioId = saved.nextId || 0;
			roomAudioMap = saved.roomAudioMap || {};
		}
	} catch(e) {
		console.warn("Could not load audio data:", e);
	}
}

/* ---- Room audio playback (play mode only) ---- */

var _curRoomAudioEl = null;

function startRoomAudio(roomId) {
	stopRoomAudio();
	if (typeof roomAudioMap === "undefined") return;
	var afId = roomAudioMap[roomId];
	if (!afId || !audioFiles[afId]) return;
	_curRoomAudioEl = new Audio(audioFiles[afId].dataUrl);
	_curRoomAudioEl.loop = true;
	_curRoomAudioEl.play().catch(function() {});
}

function stopRoomAudio() {
	if (_curRoomAudioEl) {
		_curRoomAudioEl.pause();
		_curRoomAudioEl.currentTime = 0;
		_curRoomAudioEl = null;
	}
}

// Returns a flat list of {value, text, description} for all imported audio files,
// ready for use in a select dropdown. Values are prefixed with "audio:" to distinguish
// them from built-in tune IDs.
function getAudioFileOptions() {
	var options = [];
	var ids = Object.keys(audioFiles);
	for (var i = 0; i < ids.length; i++) {
		var af = audioFiles[ids[i]];
		options.push({
			value: "audio:" + af.id,
			text: af.name,
			description: af.name + " (imported audio)"
		});
	}
	return options;
}
