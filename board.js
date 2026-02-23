document.addEventListener('DOMContentLoaded', () => {
    const fileListContainer = document.getElementById('file-list');

    // XSS Prevention Utils
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Fetch and display files
    async function loadFiles() {
        try {
            // Fetch directly from FastAPI backend
            const response = await fetch(`/api/files`);
            if (!response.ok) throw new Error('Data fetch failed');
            const files = await response.json();

            fileListContainer.innerHTML = ''; // Clear loading state

            if (files.length === 0) {
                fileListContainer.innerHTML = '<div class="empty-state">등록된 자료가 없습니다.</div>';
                return;
            }

            files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'resource-item fade-up';

                // Add category label if it exists
                const safeCategory = escapeHtml(file.category);
                const safeTitle = escapeHtml(file.title);
                const categoryHtml = safeCategory ? `<span class="category-badge">${safeCategory}</span> ` : '';

                item.innerHTML = `
                    <div class="col-title">
                        <span class="file-icon">📄</span>
                        <div style="display: flex; flex-direction: column;">
                            <span class="file-name">${categoryHtml}${safeTitle}</span>
                        </div>
                    </div>
                    <div class="col-date">${file.date}</div>
                    <div class="col-size">${file.size}</div>
                    <div class="col-action">
                        <!-- URL comes directly from Firebase Storage via Backend -->
                        <a href="${file.url}" download="${(file.originalName || file.filename).normalize('NFC')}" target="_blank" class="download-btn">
                            <span class="download-icon">↓</span>
                        </a>
                    </div>
                `;
                fileListContainer.appendChild(item);
            });

            // Trigger animations
            setTimeout(() => {
                document.querySelectorAll('.fade-up').forEach(el => el.classList.add('visible'));
            }, 50);

        } catch (error) {
            console.error('Error fetching files:', error);
            fileListContainer.innerHTML = '<div class="empty-state">자료를 불러오는데 실패했습니다.</div>';
        }
    }

    // Initial load
    loadFiles();
});
