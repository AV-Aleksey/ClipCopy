const { ipcRenderer } = require('electron');

// Конфигурация приложения
const CONFIG = {
    // Настройки истории
    HISTORY: {
        MAX_ITEMS: 100
    },

    // Настройки уведомлений
    NOTIFICATIONS: {
        DEFAULT_DURATION: 3000,
        POSITION: {
            TOP: '20px',
            RIGHT: '20px'
        }
    },

    // Настройки локализации
    LOCALE: {
        DEFAULT: 'ru-RU',
        DATE_FORMAT: 'ru-RU'
    },

    // Сообщения
    MESSAGES: {
        EMPTY_HISTORY: {
            TITLE: 'История пуста',
            DESCRIPTION: 'Скопируйте текст в любом приложении, и он появится здесь'
        },
        CONFIRM_CLEAR: 'Вы уверены, что хотите очистить всю историю?',
        SUCCESS: {
            COPIED: 'Текст скопирован в буфер обмена',
            CLEARED: 'История очищена',
            ADDED: 'Новый текст добавлен в историю'
        },
        ERROR: {
            LOAD: 'Ошибка при загрузке истории',
            CLEAR: 'Ошибка при очистке истории',
            COPY: 'Ошибка при копировании'
        }
    },

    // Селекторы DOM элементов
    SELECTORS: {
        HISTORY_LIST: '#historyList',
        NOTIFICATION: '#notification'
    },

    // Классы CSS
    CSS_CLASSES: {
        HISTORY_ITEM: 'history-item',
        EMPTY_STATE: 'empty-state',
        NOTIFICATION_SHOW: 'show'
    }
};

// Утилиты
const Utils = {
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Функция для определения, является ли текст кодом
    isCode(text) {
        // Быстрые проверки для исключения обычного текста
        if (text.length < 10) return false;
        
        // Проверяем наличие характерных признаков кода
        const codePatterns = [
            // Ключевые слова программирования
            /\b(function|class|const|let|var|if|else|for|while|return|import|export|require|console|document|window|def|public|private|static|void|int|string|boolean|true|false|null|undefined)\b/,
            // Синтаксис функций
            /\([^)]*\)\s*=>/,
            /function\s*\(/,
            /def\s+\w+\s*\(/,
            // Синтаксис объектов и массивов
            /\{[^}]*\}/,
            /\[[^\]]*\]/,
            // Операторы
            /[=!<>]==/,
            /[+\-*/%]=/,
            // Строки с кавычками
            /["'`][^"'`]*["'`]/,
            // Комментарии
            /\/\/.*$/m,
            /\/\*[\s\S]*?\*\//,
            /#.*$/m,
            // HTML теги
            /<[^>]+>/,
            // CSS селекторы
            /[.#][a-zA-Z][a-zA-Z0-9_-]*/,
            // Пути к файлам
            /\.(js|ts|jsx|tsx|html|css|scss|less|py|java|cpp|c|php|rb|go|rs|swift|kt|dart)$/i,
            // Импорты/экспорты
            /import\s+.*\s+from/,
            /export\s+(default|{)/,
            /from\s+['"`]/,
            // Консольные команды
            /console\.(log|warn|error|info)/,
            // Методы DOM
            /\.(getElementById|querySelector|addEventListener|setAttribute)/,
            // Методы массивов
            /\.(map|filter|reduce|forEach|find|some|every)/,
            // Методы строк
            /\.(split|join|replace|substring|toLowerCase|toUpperCase)/
        ];

        // Подсчитываем количество совпадений
        let codeScore = 0;
        codePatterns.forEach(pattern => {
            if (pattern.test(text)) {
                codeScore++;
            }
        });

        // Дополнительные проверки
        const lines = text.split('\n');
        const hasMultipleLines = lines.length > 1;
        const hasIndentation = lines.some(line => line.startsWith('    ') || line.startsWith('\t'));
        const hasBrackets = text.includes('{') && text.includes('}');
        const hasParentheses = text.includes('(') && text.includes(')');
        const hasSemicolons = text.includes(';');
        const hasOperators = /[+\-*/%=<>!&|]/.test(text);
        const hasColons = text.includes(':');
        const hasEquals = text.includes('=');

        // Увеличиваем счетчик за дополнительные признаки
        if (hasMultipleLines) codeScore += 2;
        if (hasIndentation) codeScore += 3;
        if (hasBrackets) codeScore += 2;
        if (hasParentheses) codeScore += 1;
        if (hasSemicolons) codeScore += 2;
        if (hasOperators) codeScore += 1;
        if (hasColons) codeScore += 1;
        if (hasEquals) codeScore += 1;

        // Проверяем соотношение символов (код обычно имеет больше специальных символов)
        const specialChars = (text.match(/[{}()\[\];=<>+\-*/%&|!:]/g) || []).length;
        const totalChars = text.length;
        const specialCharRatio = specialChars / totalChars;

        if (specialCharRatio > 0.05) codeScore += 3;

        // Проверяем наличие типичных конструкций программирования
        if (text.includes('if (') || text.includes('if(')) codeScore += 2;
        if (text.includes('for (') || text.includes('for(')) codeScore += 2;
        if (text.includes('while (') || text.includes('while(')) codeScore += 2;
        if (text.includes('function ') || text.includes('def ')) codeScore += 3;
        if (text.includes('class ')) codeScore += 3;
        if (text.includes('return ')) codeScore += 2;

        // Проверяем наличие типичных файловых расширений в путях
        if (/\.(js|ts|jsx|tsx|html|css|scss|less|py|java|cpp|c|php|rb|go|rs|swift|kt|dart)/i.test(text)) codeScore += 2;

        // Возвращаем true, если набрали достаточно баллов
        const isCodeResult = codeScore >= 6;
        console.log('isCode check:', { text: text.substring(0, 50) + '...', codeScore, isCodeResult });
        return isCodeResult;
    },

    // Функция для форматирования кода с помощью highlight.js
    formatCode(text) {
        try {
            console.log('formatCode called with:', text.substring(0, 50) + '...');
            // Создаем временный элемент для highlight.js
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = text;
            pre.appendChild(code);
            
            // Применяем подсветку синтаксиса
            hljs.highlightElement(code);
            
            const result = pre.outerHTML;
            console.log('formatCode result:', result.substring(0, 100) + '...');
            return result;
        } catch (error) {
            console.warn('Ошибка при форматировании кода:', error);
            // Возвращаем простой код без подсветки
            return `<pre><code>${this.escapeHtml(text)}</code></pre>`;
        }
    },

    formatDate(date, locale = 'ru-RU') {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dateObj.toLocaleString(locale);
    },

    showNotification(message, duration = 3000) {
        const notification = document.getElementById('notification');
        if (!notification) {
            console.warn('Элемент уведомления не найден');
            return;
        }

        notification.textContent = message;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, duration);
    }
};

class ClipboardHistory {
    constructor() {
        this.history = [];
        this.filteredHistory = [];
        this.maxItems = CONFIG.HISTORY.MAX_ITEMS;
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.lastCopiedIndex = -1; // Индекс последнего скопированного элемента
        this.init();
    }

    async init() {
        // Инициализируем highlight.js
        if (typeof hljs !== 'undefined') {
            hljs.highlightAll();
            console.log('highlight.js initialized');
        } else {
            console.warn('highlight.js not loaded');
        }
        
        await this.loadHistory();
        this.setupEventListeners();
        this.setupSearchAndFilters();
    }

    async loadHistory() {
        try {
            this.history = await ipcRenderer.invoke('get-clipboard-history');
            this.applyFilters();
        } catch (error) {
            console.error(CONFIG.MESSAGES.ERROR.LOAD, error);
        }
    }

    async refreshHistory() {
        await this.loadHistory();
    }

    async clearHistory() {
        if (confirm(CONFIG.MESSAGES.CONFIRM_CLEAR)) {
            try {
                const result = await ipcRenderer.invoke('clear-clipboard-history');
                if (result.success) {
                    this.history = [];
                    this.filteredHistory = [];
                    this.lastCopiedIndex = -1; // Сбрасываем индекс последнего скопированного элемента
                    this.renderHistory();
                    Utils.showNotification(CONFIG.MESSAGES.SUCCESS.CLEARED);
                } else {
                    alert(CONFIG.MESSAGES.ERROR.CLEAR);
                }
            } catch (error) {
                console.error(CONFIG.MESSAGES.ERROR.CLEAR, error);
                alert(CONFIG.MESSAGES.ERROR.CLEAR);
            }
        }
    }

    async copyToClipboard(text, index) {
        try {
            console.log('copyToClipboard called with:', { text: text.substring(0, 100) + '...', index, isCode: Utils.isCode(text) });
            const result = await ipcRenderer.invoke('copy-to-clipboard', text);
            if (result.success) {
                // Возвращаем иконку копирования на предыдущем элементе
                if (this.lastCopiedIndex !== -1 && this.lastCopiedIndex !== index) {
                    this.updateCopyIcon(this.lastCopiedIndex, '📋');
                }
                
                // Показываем галочку на текущем элементе
                this.updateCopyIcon(index, '✅');
                this.lastCopiedIndex = index;
                
                Utils.showNotification(CONFIG.MESSAGES.SUCCESS.COPIED);
            } else {
                alert(CONFIG.MESSAGES.ERROR.COPY);
            }
        } catch (error) {
            console.error(CONFIG.MESSAGES.ERROR.COPY, error);
            alert(CONFIG.MESSAGES.ERROR.COPY);
        }
    }

    updateCopyIcon(index, icon) {
        const historyItems = document.querySelectorAll(`.${CONFIG.CSS_CLASSES.HISTORY_ITEM}`);
        if (historyItems[index]) {
            const copyIcon = historyItems[index].querySelector('.copy-icon');
            if (copyIcon) {
                copyIcon.textContent = icon;
            }
        }
    }

    addNewItem(text) {
        // Проверяем, не является ли новый текст таким же, как последний добавленный
        if (this.history.length > 0 && this.history[0].text === text) {
            console.log('Пропускаем дублирующий элемент:', text);
            return;
        }

        const newItem = {
            id: Date.now(),
            text: text,
            timestamp: new Date().toISOString()
        };

        this.history.unshift(newItem);
        
        // Ограничиваем количество элементов
        if (this.history.length > this.maxItems) {
            this.history = this.history.slice(0, this.maxItems);
        }
        
        // Сбрасываем индекс последнего скопированного элемента при добавлении нового
        this.lastCopiedIndex = -1;
        
        this.applyFilters();
        Utils.showNotification(CONFIG.MESSAGES.SUCCESS.ADDED);
    }

    renderHistory() {
        const historyList = document.querySelector(CONFIG.SELECTORS.HISTORY_LIST);
        
        if (this.filteredHistory.length === 0) {
            if (this.history.length === 0) {
                historyList.innerHTML = this.getEmptyStateHTML();
            } else {
                historyList.innerHTML = this.getNoResultsHTML();
            }
            return;
        }

        historyList.innerHTML = this.filteredHistory.map((item, index) => {
            return this.getItemHTML(item, index);
        }).join('');
        
        // Переинициализируем highlight.js для новых элементов кода
        if (typeof hljs !== 'undefined') {
            hljs.highlightAll();
        }
    }

    getEmptyStateHTML() {
        return `
            <div class="${CONFIG.CSS_CLASSES.EMPTY_STATE}">
                <div class="icon">📋</div>
                <h3>${CONFIG.MESSAGES.EMPTY_HISTORY.TITLE}</h3>
                <p>${CONFIG.MESSAGES.EMPTY_HISTORY.DESCRIPTION}</p>
            </div>
        `;
    }

    getNoResultsHTML() {
        return `
            <div class="${CONFIG.CSS_CLASSES.EMPTY_STATE}">
                <div class="icon">🔍</div>
                <h3>Ничего не найдено</h3>
                <p>Попробуйте изменить поисковый запрос или фильтр</p>
            </div>
        `;
    }

    getItemHTML(item, index) {
        const timestamp = Utils.formatDate(item.timestamp, CONFIG.LOCALE.DATE_FORMAT);
        
        // Определяем какую иконку показывать
        const icon = (index === this.lastCopiedIndex) ? '✅' : '📋';
        
        // Проверяем, является ли текст кодом
        const isCode = Utils.isCode(item.text);
        
        console.log('getItemHTML:', { 
            index, 
            textLength: item.text.length, 
            isCode, 
            textPreview: item.text.substring(0, 50) + '...' 
        });
        
        let contentHTML;
        
        if (isCode) {
            // Если это код, отображаем его в специальном блоке
            const formattedCode = Utils.formatCode(item.text);

            contentHTML = `
                <div class="code-block">
                    <div class="code-label" data-language="code">code</div>
                    <div class="code-content">
                        ${formattedCode}
                    </div>
                </div>
            `;
        } else {
            // Если это обычный текст, отображаем как обычно
            contentHTML = `<div class="item-text">${Utils.escapeHtml(item.text)}</div>`;
        }
        
        return `
            <div class="${CONFIG.CSS_CLASSES.HISTORY_ITEM}" data-index="${index}" data-text="${encodeURIComponent(item.text)}">
                <div class="copy-icon">${icon}</div>
                ${contentHTML}
                <div class="item-meta">
                    <span class="item-timestamp">${timestamp}</span>
                </div>
            </div>
        `;
    }



    setupEventListeners() {
        // Слушаем новые события буфера обмена
        ipcRenderer.on('new-clipboard-text', (event, data) => {
            this.addNewItem(data.text);
        });

        // Обработчик кликов по элементам истории (делегирование событий)
        document.addEventListener('click', (e) => {
            const historyItem = e.target.closest(`.${CONFIG.CSS_CLASSES.HISTORY_ITEM}`);
            if (historyItem) {
                const index = parseInt(historyItem.dataset.index);
                const encodedText = historyItem.dataset.text;
                const text = encodedText ? decodeURIComponent(encodedText) : null;
                console.log('Click detected on history item:', { 
                    target: e.target.tagName, 
                    targetClass: e.target.className,
                    index, 
                    text: text ? text.substring(0, 50) + '...' : 'undefined',
                    isCode: text ? Utils.isCode(text) : false
                });
                if (!isNaN(index) && text) {
                    this.copyToClipboard(text, index);
                }
            }
        });

        // Двойной клик по области заголовка для максимизации/восстановления окна
        const titlebar = document.querySelector('.titlebar');
        if (titlebar) {
            titlebar.addEventListener('dblclick', () => {
                ipcRenderer.invoke('maximize-window');
            });
        }
    }

    setupSearchAndFilters() {
        // Поиск
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.applyFilters();
            });
        }

        // Фильтры
        const filterTabs = document.querySelectorAll('.filter-tab');
        filterTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Убираем активный класс у всех вкладок
                filterTabs.forEach(t => t.classList.remove('active'));
                // Добавляем активный класс к выбранной вкладке
                e.target.classList.add('active');
                
                this.currentFilter = e.target.dataset.filter;
                this.applyFilters();
            });
        });
    }

    applyFilters() {
        this.filteredHistory = this.history.filter(item => {
            // Применяем поиск
            const matchesSearch = this.searchQuery === '' || 
                item.text.toLowerCase().includes(this.searchQuery);
            
            if (!matchesSearch) return false;

            // Применяем фильтр по времени
            const itemDate = new Date(item.timestamp);
            const now = new Date();
            
            switch (this.currentFilter) {
                case 'today':
                    return itemDate.toDateString() === now.toDateString();
                case 'week':
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    return itemDate >= weekAgo;
                case 'month':
                    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    return itemDate >= monthAgo;
                default:
                    return true;
            }
        });

        this.renderHistory();
    }
}

// Экспортируем экземпляр класса
const clipboardHistory = new ClipboardHistory();

// Делаем доступным глобально для HTML
window.clipboardHistory = clipboardHistory;
window.refreshHistory = () => clipboardHistory.refreshHistory();
window.clearHistory = () => clipboardHistory.clearHistory();

// Функции для управления окном
window.close = () => {
    ipcRenderer.invoke('close-window');
};

window.minimize = () => {
    ipcRenderer.invoke('minimize-window');
};

window.maximize = () => {
    ipcRenderer.invoke('maximize-window');
};

module.exports = clipboardHistory;
