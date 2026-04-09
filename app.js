/* ========================================
   Location Identifier - App Logic
   ======================================== */

(function () {
    'use strict';

    // ── State ──────────────────────────────
    let csvData = [];            // Parsed CSV rows (array of objects)
    let csvHeaders = [];         // Column headers
    let groups = [];             // Grouped data: same game + same video URL + consecutive timestamps
    let currentGroupIndex = 0;   // Currently viewed group
    let hasUnsavedChanges = false;

    const STORAGE_KEY = 'location_identifier_data';
    const STORAGE_HEADERS_KEY = 'location_identifier_headers';
    const STORAGE_POSITION_KEY = 'location_identifier_position';
    const STORAGE_CUSTOM_LOCATIONS_KEY = 'location_identifier_custom_locations';

    let customLocations = [];    // User-defined location labels

    // ── DOM refs ───────────────────────────
    const csvFileInput = document.getElementById('csvFileInput');
    const emptyState = document.getElementById('emptyState');
    const mainContent = document.getElementById('mainContent');
    const videoPlayer = document.getElementById('videoPlayer');
    const videoOverlay = document.getElementById('videoOverlay');
    const videoLink = document.getElementById('videoLink');
    const videoLinkText = document.getElementById('videoLinkText');
    const locationSelect = document.getElementById('locationSelect');
    const timestampsContainer = document.getElementById('timestampsContainer');
    const bulkIndicator = document.getElementById('bulkIndicator');
    const bulkCount = document.getElementById('bulkCount');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const currentGroupInput = document.getElementById('currentGroupInput');
    const totalRows = document.getElementById('totalRows');
    const saveBtn = document.getElementById('saveBtn');
    const saveStatus = document.getElementById('saveStatus');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const progressIndicator = document.getElementById('progressIndicator');
    const progressCurrent = document.getElementById('progressCurrent');
    const progressTotal = document.getElementById('progressTotal');
    const progressBarFill = document.getElementById('progressBarFill');
    const gameDate = document.getElementById('gameDate');
    const gameLabel = document.getElementById('gameLabel');
    const exportBtn = document.getElementById('exportBtn');
    const customLocationWrapper = document.getElementById('customLocationWrapper');
    const customLocationInput = document.getElementById('customLocationInput');
    const addLocationBtn = document.getElementById('addLocationBtn');
    const rearrangeBtn = document.getElementById('rearrangeBtn');

    // ── Init ───────────────────────────────
    function init() {
        // Try to load saved data from localStorage
        const savedData = localStorage.getItem(STORAGE_KEY);
        const savedHeaders = localStorage.getItem(STORAGE_HEADERS_KEY);

        // Load custom locations
        const savedCustom = localStorage.getItem(STORAGE_CUSTOM_LOCATIONS_KEY);
        if (savedCustom) {
            customLocations = JSON.parse(savedCustom);
            updateLocationDropdown();
        }

        if (savedData && savedHeaders) {
            csvHeaders = JSON.parse(savedHeaders);
            csvData = JSON.parse(savedData);
            buildGroups();
            extractExistingLocations();
            // Restore saved position, or jump to first empty
            const savedPosition = localStorage.getItem(STORAGE_POSITION_KEY);
            if (savedPosition !== null) {
                currentGroupIndex = Math.min(parseInt(savedPosition), groups.length - 1);
            } else {
                jumpToFirstEmpty();
            }
            showMainContent();
            renderGroup();
            updateSaveStatus(false);
            rearrangeBtn.style.display = 'inline-flex';
        }

        // Event listeners
        csvFileInput.addEventListener('change', handleFileImport);
        locationSelect.addEventListener('change', handleLocationChange);
        prevBtn.addEventListener('click', () => navigateGroup(-1));
        nextBtn.addEventListener('click', () => navigateGroup(1));
        saveBtn.addEventListener('click', handleSave);
        exportBtn.addEventListener('click', handleExport);
        rearrangeBtn.addEventListener('click', handleRearrangeAndSave);
        addLocationBtn.addEventListener('click', handleAddCustomLocation);
        customLocationInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleAddCustomLocation();
        });

        // Group input: jump to typed number on Enter or blur
        currentGroupInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                jumpToGroupNumber();
                currentGroupInput.blur();
            }
        });
        currentGroupInput.addEventListener('blur', jumpToGroupNumber);

        videoOverlay.addEventListener('click', () => {
            videoPlayer.play();
            videoOverlay.classList.add('hidden');
        });

        videoPlayer.addEventListener('play', () => videoOverlay.classList.add('hidden'));
        videoPlayer.addEventListener('pause', () => videoOverlay.classList.remove('hidden'));
        videoPlayer.addEventListener('ended', () => videoOverlay.classList.remove('hidden'));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (groups.length === 0) return;
            if (e.target.tagName === 'SELECT') return;

            if (e.key === 'ArrowLeft' || e.key === 'a') {
                navigateGroup(-1);
            } else if (e.key === 'ArrowRight' || e.key === 'd') {
                navigateGroup(1);
            } else if (e.key === '1') {
                locationSelect.value = 'Bench Signage';
                handleLocationChange();
            } else if (e.key === '2') {
                locationSelect.value = 'Static Dasherboard';
                handleLocationChange();
            } else if (e.key === '3') {
                locationSelect.value = 'Vomitory';
                handleLocationChange();
            } else if (e.key === '4') {
                locationSelect.value = 'undefined';
                handleLocationChange();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        });

        // Warn user before closing if there are unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Please export your data before leaving.';
                return e.returnValue;
            }
        });
    }

    // ── CSV Parsing ────────────────────────
    function handleFileImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            const text = event.target.result;
            parseCSV(text);
            buildGroups();
            extractExistingLocations();
            jumpToFirstEmpty();
            showMainContent();
            renderGroup();
            updateSaveStatus(false);
            rearrangeBtn.style.display = 'inline-flex';
            showToast(`Imported ${csvData.length} rows successfully!`);
        };
        reader.readAsText(file);
    }

    function parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) return;

        csvHeaders = parseCSVLine(lines[0]);
        csvData = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length === csvHeaders.length) {
                const row = {};
                csvHeaders.forEach((header, idx) => {
                    row[header] = values[idx];
                });
                row._originalIndex = i - 1; // Track original row index
                csvData.push(row);
            }
        }
    }

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (inQuotes) {
                if (char === '"') {
                    if (i + 1 < line.length && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    current += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
        }
        result.push(current.trim());
        return result;
    }

    // ── Grouping Logic ─────────────────────
    // Group rows by: same game (date_event) + same base video URL + consecutive timestamps
    function buildGroups() {
        groups = [];
        if (csvData.length === 0) return;

        // Sort by date_event, then by video URL (base without #t=), then by label_time
        const sorted = [...csvData].map((row, idx) => ({ ...row, _dataIndex: idx }));

        sorted.sort((a, b) => {
            const dateComp = (a.date_event || '').localeCompare(b.date_event || '');
            if (dateComp !== 0) return dateComp;

            const urlA = getBaseUrl(a.timestamp_url || '');
            const urlB = getBaseUrl(b.timestamp_url || '');
            const urlComp = urlA.localeCompare(urlB);
            if (urlComp !== 0) return urlComp;

            return parseInt(a.label_time || 0) - parseInt(b.label_time || 0);
        });

        let currentGroup = null;

        for (const row of sorted) {
            const baseUrl = getBaseUrl(row.timestamp_url || '');
            const time = parseInt(row.label_time || 0);

            if (currentGroup &&
                currentGroup.dateEvent === row.date_event &&
                currentGroup.baseUrl === baseUrl &&
                time - currentGroup.lastTime <= 1) {
                // Consecutive: add to current group
                currentGroup.rows.push(row);
                currentGroup.lastTime = time;
            } else {
                // New group
                currentGroup = {
                    dateEvent: row.date_event,
                    baseUrl: baseUrl,
                    firstTime: time,
                    lastTime: time,
                    rows: [row]
                };
                groups.push(currentGroup);
            }
        }
    }

    // Extract unique locations from CSV to populate dropdown
    function extractExistingLocations() {
        const defaults = ['', 'Bench Signage', 'Static Dasherboard', 'Vomitory', 'undefined'];
        csvData.forEach(row => {
            const loc = (row['Location Enhancement Name'] || '').trim();
            if (loc && !defaults.includes(loc) && !customLocations.includes(loc)) {
                customLocations.push(loc);
            }
        });
        updateLocationDropdown();
        localStorage.setItem(STORAGE_CUSTOM_LOCATIONS_KEY, JSON.stringify(customLocations));
    }

    function getBaseUrl(url) {
        return (url || '').split('#')[0];
    }

    function handleRearrangeAndSave() {
        if (csvData.length === 0) return;

        // Perform sorting
        csvData.sort((a, b) => {
            const dateComp = (a.date_event || '').localeCompare(b.date_event || '');
            if (dateComp !== 0) return dateComp;

            const urlA = getBaseUrl(a.timestamp_url || '');
            const urlB = getBaseUrl(b.timestamp_url || '');
            const urlComp = urlA.localeCompare(urlB);
            if (urlComp !== 0) return urlComp;

            return parseInt(a.label_time || 0) - parseInt(b.label_time || 0);
        });

        // Re-index to make Row 1 match the new first row
        csvData.forEach((row, idx) => {
            row._originalIndex = idx;
            row._dataIndex = idx;
        });

        // Export this new "Master" CSV
        handleExport(true, 'Location_Identifier_REARRANGED_MASTER.csv');

        // Re-build everything
        buildGroups();
        currentGroupIndex = 0;
        renderGroup();
        updateSaveStatus(true);
        showToast('CSV rearranged chronologically and Master copy downloaded!');
    }

    // Find the first group where Location Enhancement Name is empty
    function jumpToFirstEmpty() {
        for (let i = 0; i < groups.length; i++) {
            const hasEmpty = groups[i].rows.some(row => {
                const loc = (row['Location Enhancement Name'] || '').trim();
                return loc === '';
            });
            if (hasEmpty) {
                currentGroupIndex = i;
                return;
            }
        }
        // If all are filled, stay at index 0
        currentGroupIndex = 0;
    }

    // ── Rendering ──────────────────────────
    function showMainContent() {
        emptyState.style.display = 'none';
        mainContent.style.display = 'flex';
        progressIndicator.style.display = 'flex';
        exportBtn.style.display = 'inline-flex';
    }

    function renderGroup() {
        if (groups.length === 0) return;

        const group = groups[currentGroupIndex];
        const firstRow = group.rows[0];

        // Update game info
        gameDate.textContent = firstRow.date_event || '-';
        gameLabel.textContent = firstRow.label || '-';

        // Update video
        const videoUrl = group.baseUrl;
        const startTime = group.firstTime;

        videoPlayer.src = videoUrl + '#t=' + startTime;
        videoOverlay.classList.remove('hidden');

        // Update video link
        const fullUrl = firstRow.timestamp_url || '#';
        videoLink.href = fullUrl;
        // Shorten displayed URL
        const shortUrl = videoUrl.split('/').pop();
        videoLinkText.textContent = shortUrl + ' #t=' + startTime;

        // Update location select
        const currentLocation = firstRow['Location Enhancement Name'] || '';
        locationSelect.value = currentLocation;

        // Update timestamps
        timestampsContainer.innerHTML = '';
        group.rows.forEach((row, idx) => {
            const badge = document.createElement('span');
            badge.className = 'timestamp-badge';
            badge.textContent = row.label_time + 's';
            badge.title = `Jump to ${row.label_time}s`;
            badge.addEventListener('click', () => {
                videoPlayer.currentTime = parseInt(row.label_time);
                videoPlayer.play();
                // Highlight active
                document.querySelectorAll('.timestamp-badge').forEach(b => b.classList.remove('active'));
                badge.classList.add('active');
            });
            if (idx === 0) badge.classList.add('active');
            timestampsContainer.appendChild(badge);
        });

        // Bulk indicator
        if (group.rows.length > 1) {
            bulkIndicator.style.display = 'flex';
            bulkCount.textContent = group.rows.length;
        } else {
            bulkIndicator.style.display = 'none';
        }

        // Navigation
        updateNavigation();
        updateProgress();
    }

    function updateNavigation() {
        const group = groups[currentGroupIndex];
        const rowNum = group.rows[0]._originalIndex + 1;
        currentGroupInput.value = rowNum;
        currentGroupInput.max = csvData.length;
        totalRows.textContent = csvData.length;
        prevBtn.disabled = currentGroupIndex === 0;
        nextBtn.disabled = currentGroupIndex === groups.length - 1;
    }

    function updateProgress() {
        const group = groups[currentGroupIndex];
        const rowNum = group.rows[0]._originalIndex + 1;
        progressCurrent.textContent = rowNum;
        progressTotal.textContent = csvData.length;
        const pct = (rowNum / csvData.length) * 100;
        progressBarFill.style.width = pct + '%';
    }

    function navigateGroup(direction) {
        const newIndex = currentGroupIndex + direction;
        if (newIndex < 0 || newIndex >= groups.length) return;
        currentGroupIndex = newIndex;
        renderGroup();
    }

    function jumpToGroupNumber() {
        let rowNum = parseInt(currentGroupInput.value);
        if (isNaN(rowNum)) rowNum = 1;
        rowNum = Math.max(1, Math.min(rowNum, csvData.length));

        // Find group that contains this row originalIndex
        const targetIdx = rowNum - 1;
        for (let i = 0; i < groups.length; i++) {
            const hasRow = groups[i].rows.some(r => r._originalIndex === targetIdx);
            if (hasRow) {
                currentGroupIndex = i;
                renderGroup();
                return;
            }
        }

        // If not found in any group (unlikely if data is consistent), find closest
        for (let i = 0; i < groups.length; i++) {
            if (groups[i].rows[0]._originalIndex >= targetIdx) {
                currentGroupIndex = i;
                renderGroup();
                return;
            }
        }
    }

    // ── Location Change ────────────────────
    function handleLocationChange() {
        const value = locationSelect.value;

        // Show custom input if "undefined" selected
        if (value === 'undefined') {
            customLocationWrapper.style.display = 'flex';
            customLocationInput.focus();
        } else {
            customLocationWrapper.style.display = 'none';
        }

        const group = groups[currentGroupIndex];

        // Update all rows in the group (bulk edit)
        group.rows.forEach(row => {
            row['Location Enhancement Name'] = value;
            // Also update the original csvData
            const dataIdx = row._dataIndex;
            if (dataIdx !== undefined) {
                csvData[dataIdx]['Location Enhancement Name'] = value;
            }
        });

        updateSaveStatus(true);
    }

    function handleAddCustomLocation() {
        const val = customLocationInput.value.trim();
        if (!val) return;

        // Add to state if not exists
        if (!customLocations.includes(val)) {
            customLocations.push(val);
            updateLocationDropdown();
            // Save custom list immediately
            localStorage.setItem(STORAGE_CUSTOM_LOCATIONS_KEY, JSON.stringify(customLocations));
        }

        // Select the new location
        locationSelect.value = val;
        customLocationInput.value = '';
        customLocationWrapper.style.display = 'none';

        // Trigger normal change logic
        handleLocationChange();
        showToast(`Added location: ${val}`);
    }

    function updateLocationDropdown() {
        // Keep initial options
        const initials = [
            { val: '', label: 'Select location' },
            { val: 'Bench Signage', label: 'Bench Signage' },
            { val: 'Static Dasherboard', label: 'Static Dasherboard' },
            { val: 'Vomitory', label: 'Vomitory' },
            { val: 'undefined', label: 'undefined' }
        ];

        locationSelect.innerHTML = '';

        // Add default options
        initials.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.val;
            el.textContent = opt.label;
            locationSelect.appendChild(el);
        });

        // Add custom locations (before undefined)
        const undefinedOption = locationSelect.querySelector('option[value="undefined"]');
        customLocations.forEach(loc => {
            const el = document.createElement('option');
            el.value = loc;
            el.textContent = loc;
            locationSelect.insertBefore(el, undefinedOption);
        });
    }

    function handleSave() {
        // Save to localStorage (for quick reload)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(csvData));
        localStorage.setItem(STORAGE_HEADERS_KEY, JSON.stringify(csvHeaders));
        localStorage.setItem(STORAGE_POSITION_KEY, currentGroupIndex.toString());
        localStorage.setItem(STORAGE_CUSTOM_LOCATIONS_KEY, JSON.stringify(customLocations));

        // Also download CSV file as backup (survives cache clear)
        handleExport(true);

        updateSaveStatus(false);
        showToast('Saved & CSV file downloaded as backup!');
    }

    function updateSaveStatus(unsaved) {
        hasUnsavedChanges = unsaved;
        const dot = saveStatus.querySelector('.status-dot');
        const text = saveStatus.querySelector('span');

        if (unsaved) {
            dot.className = 'status-dot unsaved';
            text.textContent = 'Unsaved changes';
        } else {
            dot.className = 'status-dot saved';
            text.textContent = 'All changes saved';
        }
    }

    // ── Export ──────────────────────────────
    function handleExport(silent, customFilename) {
        if (csvData.length === 0 || csvHeaders.length === 0) return;

        let csvContent = csvHeaders.join(',') + '\n';

        csvData.forEach(row => {
            const line = csvHeaders.map(header => {
                let val = row[header] || '';
                // Ensure val is string
                val = String(val);
                // Escape commas and quotes
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            });
            csvContent += line.join(',') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = customFilename || 'Leafs Broadcast Loc Enhancement Breakouts - Updated.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (!silent) {
            showToast('CSV exported successfully!');
        }
    }

    // ── Toast ──────────────────────────────
    function showToast(message) {
        toastMessage.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // ── Start ──────────────────────────────
    document.addEventListener('DOMContentLoaded', init);
})();
