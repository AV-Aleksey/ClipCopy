const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

class ClipboardDatabase {
    constructor() {
        this.dbPath = path.join(app.getPath('userData'), 'clipboard.db');
        this.db = null;
        this.init();
    }

    init() {
        try {
            this.db = new Database(this.dbPath);
            console.log('База данных подключена');
            this.createTable();
        } catch (err) {
            console.error('Ошибка при открытии базы данных:', err.message);
        }
    }

    createTable() {
        try {
            const sql = `
                CREATE TABLE IF NOT EXISTS clipboard_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    text TEXT NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;
            
            this.db.exec(sql);
            console.log('Таблица clipboard_history создана или уже существует');
        } catch (err) {
            console.error('Ошибка при создании таблицы:', err.message);
        }
    }

    addClipboardText(text) {
        return new Promise((resolve, reject) => {
            try {
                if (!text || text.trim() === '') {
                    resolve();
                    return;
                }

                // Добавляем новую запись
                const insertStmt = this.db.prepare('INSERT INTO clipboard_history (text) VALUES (?)');
                insertStmt.run(text);

                // Проверяем количество записей
                const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM clipboard_history');
                const row = countStmt.get();

                // Если записей больше 100, удаляем самые старые
                if (row.count > 100) {
                    const deleteStmt = this.db.prepare(`
                        DELETE FROM clipboard_history 
                        WHERE id NOT IN (
                            SELECT id FROM clipboard_history 
                            ORDER BY timestamp DESC 
                            LIMIT 100
                        )
                    `);
                    deleteStmt.run();
                }

                resolve();
            } catch (err) {
                console.error('Ошибка при добавлении текста:', err.message);
                reject(err);
            }
        });
    }

    getClipboardHistory() {
        return new Promise((resolve, reject) => {
            try {
                const stmt = this.db.prepare('SELECT * FROM clipboard_history ORDER BY timestamp DESC');
                const rows = stmt.all();
                resolve(rows);
            } catch (err) {
                console.error('Ошибка при получении истории:', err.message);
                reject(err);
            }
        });
    }

    clearHistory() {
        return new Promise((resolve, reject) => {
            try {
                const stmt = this.db.prepare('DELETE FROM clipboard_history');
                stmt.run();
                resolve();
            } catch (err) {
                console.error('Ошибка при очистке истории:', err.message);
                reject(err);
            }
        });
    }

    close() {
        if (this.db) {
            try {
                this.db.close();
                console.log('База данных закрыта');
            } catch (err) {
                console.error('Ошибка при закрытии базы данных:', err.message);
            }
        }
    }
}

module.exports = ClipboardDatabase;
