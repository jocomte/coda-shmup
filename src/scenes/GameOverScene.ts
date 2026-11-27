import { GameObjects, Input, Scale, Scenes } from "phaser";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";
import SaveConstants, { type LeaderboardEntry } from "../SaveConstants.ts";
import SaveManager from "../managers/SaveManager.ts";
import { GamepadEdgeTracker } from "../utils/GamepadUtils.ts";
import { drawChamferPanel, renderLeaderboardRows } from "../utils/UITheme.ts";

export default class GameOverScene extends Phaser.Scene {
    private saveManager?: SaveManager;
    private readonly _gamepadTracker = new GamepadEdgeTracker();

    private _score: number = 0;
    private _level: number = 1;
    private _playerName: string = 'PILOTE';
    private _scoreSaved: boolean = false;
    private _savedIndex: number = -1;
    private _inputReady: boolean = false;
    private _isWide: boolean = false;
    private _lbCenterX: number = 0;
    private _lbCenterY: number = 0;
    private _lbWidth: number = 600;
    private _lbHeight: number = 480;
    private _lbMaxRows: number = 6;
    private _entryX: number = 0;
    private _entryY: number = 0;
    private _entryW: number = 600;

    private _nameText!: GameObjects.Text;
    private _entryGroup!: GameObjects.Container;
    private _leaderboardGroup!: GameObjects.Container;
    private _actionPromptText!: GameObjects.Text;
    private _cursorVisible: boolean = true;

    constructor() {
        super(GameConstants.SceneKeys.GAME_OVER);
    }

    create() {
        this.scene.stop(GameConstants.SceneKeys.MAIN_UI);
        this.scene.stop(GameConstants.SceneKeys.LEVEL_UP);
        this.scene.stop(GameConstants.SceneKeys.PAUSE);

        this.saveManager = this.game.plugins.get(SaveManager.PLUGIN_KEY) as SaveManager | undefined;
        this.saveManager?.load();

        this._score = Number(this.registry.get(RegistryConstants.Keys.PLAYER_SCORE) ?? 0);
        this._level = Number(this.registry.get(RegistryConstants.Keys.PLAYER_LEVEL) ?? 1);
        this._playerName = String(this.saveManager?.getData(SaveConstants.Keys.LAST_PLAYER_NAME) ?? 'PILOTE');
        this._scoreSaved = false;
        this._savedIndex = -1;
        this._inputReady = false;
        this._cursorVisible = true;
        this._gamepadTracker.reset(this);

        const bestScore = Number(this.saveManager?.getData(SaveConstants.Keys.PLAYER_BEST_SCORE) ?? 0);
        const isBestRecord = this._score > 0 && this._score >= bestScore;

        const width = this.scale.width;
        const height = this.scale.height;
        const cx = width / 2;
        this._isWide = width >= 1320;
        const isCompact = !this._isWide && height < 1180;

        this.add.tileSprite(0, 0, width, height, 'bg')
            .setOrigin(0, 0)
            .setTileScale(2)
            .setAlpha(0.65);

        this.add.circle(cx, 160, 360, 0x991b1b, 0.16);

        // Header
        const titleY = this._isWide ? 72 : isCompact ? 62 : 112;
        this.add.text(cx, titleY, 'GAME OVER', {
            fontSize: this._isWide ? '64px' : isCompact ? '58px' : '74px',
            fontFamily: 'future, sans-serif',
            color: '#f43f5e',
            stroke: '#020617',
            strokeThickness: 8,
            shadow: { offsetX: 0, offsetY: 0, color: '#f43f5e', blur: 18, fill: true },
        }).setOrigin(0.5);

        // Dual Telemetry Summary Cards
        const statY = titleY + 90;
        const statW = this._isWide ? 340 : 380;
        const statGap = statW / 2 + 18;
        const statGfx = this.add.graphics();

        drawChamferPanel(statGfx, cx - statGap, statY, statW, 84, {
            cut: 12,
            fillColor: 0x0b1324,
            fillAlpha: 0.92,
            strokeColor: 0xfacc15,
            strokeAlpha: 0.85,
            lineWidth: 2,
        });
        this.add.text(cx - statGap, statY - 22, 'SCORE FINAL', {
            fontSize: '14px',
            fontFamily: 'future, sans-serif',
            color: '#94a3b8',
        }).setOrigin(0.5);
        this.add.text(cx - statGap, statY + 12, `${this._score.toLocaleString('fr-FR')} PTS`, {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
        }).setOrigin(0.5);

        drawChamferPanel(statGfx, cx + statGap, statY, statW, 84, {
            cut: 12,
            fillColor: 0x0b1324,
            fillAlpha: 0.92,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.85,
            lineWidth: 2,
        });
        this.add.text(cx + statGap, statY - 22, 'NIVEAU ATTEINT', {
            fontSize: '14px',
            fontFamily: 'future, sans-serif',
            color: '#94a3b8',
        }).setOrigin(0.5);
        this.add.text(cx + statGap, statY + 12, `NIVEAU ${this._level}`, {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#38bdf8',
        }).setOrigin(0.5);

        if (isBestRecord) {
            this.add.text(cx, statY + 58, '★ NOUVEAU RECORD ! ★', {
                fontSize: '18px',
                fontFamily: 'future, sans-serif',
                color: '#fef08a',
            }).setOrigin(0.5);
        }

        // Responsive Coordinates for Entry & Leaderboard
        if (this._isWide) {
            this._entryX = width * 0.29;
            this._entryY = 448;
            this._entryW = Math.min(620, width * 0.44);
            this._lbCenterX = width * 0.72;
            this._lbCenterY = 532;
            this._lbWidth = Math.min(640, width * 0.44);
            this._lbHeight = 490;
            this._lbMaxRows = 6;
        } else if (isCompact) {
            this._entryX = cx;
            this._entryY = 342;
            this._entryW = 820;
            this._lbCenterX = cx;
            this._lbCenterY = 638;
            this._lbWidth = 820;
            this._lbHeight = 295;
            this._lbMaxRows = 3;
        } else {
            this._entryX = cx;
            this._entryY = 446;
            this._entryW = 860;
            this._lbCenterX = cx;
            this._lbCenterY = Math.min(height - 390, 990);
            this._lbWidth = 860;
            this._lbHeight = 490;
            this._lbMaxRows = 6;
        }

        // Score Entry section
        this._entryGroup = this.add.container(0, 0);
        this.buildScoreEntryUI(this._entryX, this._entryY, this._entryW);

        // Leaderboard container
        this._leaderboardGroup = this.add.container(0, 0);
        this.renderLeaderboard();

        // Replay / Home buttons
        const btnBaseX = this._isWide ? this._entryX : cx;
        const btnY = this._isWide ? 672 : isCompact ? 842 : height - 180;
        const btnW = this._isWide ? 280 : 380;
        const btnH = isCompact ? 76 : 84;
        const btnOffset = btnW / 2 + 18;

        this.buildActionBtn(btnBaseX - btnOffset, btnY, btnW, btnH, 'REJOUER', true, () => this.playAgain());
        this.buildActionBtn(btnBaseX + btnOffset, btnY, btnW, btnH, 'MENU PRINCIPAL', false, () => this.goHome());

        this._actionPromptText = this.add.text(
            btnBaseX,
            btnY + btnH / 2 + 34,
            'Tapez votre pseudo puis [ENTRÉE] ou ENREGISTRER',
            {
                fontSize: '19px',
                color: '#cbd5e1',
                align: 'center',
            }
        ).setOrigin(0.5);

        // Blinking cursor
        this.time.addEvent({
            delay: 450,
            loop: true,
            callback: () => {
                this._cursorVisible = !this._cursorVisible;
                this.refreshNameDisplay();
            },
        });

        const onResize = () => {
            if (this.scene.isActive(GameConstants.SceneKeys.GAME_OVER)) {
                this.scene.restart();
            }
        };
        this.scale.on(Scale.Events.RESIZE, onResize, this);
        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.scale.off(Scale.Events.RESIZE, onResize, this);
        }, this);

        this.time.delayedCall(350, () => {
            this._gamepadTracker.reset(this);
            this._inputReady = true;
        });

        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            if (!this._inputReady || event.repeat) return;

            if (!this._scoreSaved) {
                if (event.keyCode === Input.Keyboard.KeyCodes.ENTER) {
                    this.saveCurrentScore();
                    return;
                }
                if (event.keyCode === Input.Keyboard.KeyCodes.BACKSPACE) {
                    this._playerName = this._playerName.slice(0, -1);
                    this.refreshNameDisplay();
                    return;
                }
                if (/^[a-zA-Z0-9 _-]$/.test(event.key) && this._playerName.length < 12) {
                    this._playerName += event.key.toUpperCase();
                    this.refreshNameDisplay();
                    return;
                }
            } else {
                if (event.keyCode === Input.Keyboard.KeyCodes.SPACE || event.keyCode === Input.Keyboard.KeyCodes.ENTER) {
                    this.playAgain();
                } else if (event.keyCode === Input.Keyboard.KeyCodes.ESC) {
                    this.goHome();
                }
            }
        });

        console.log("GameOverScene created");
    }

    private buildActionBtn(x: number, y: number, w: number, h: number, label: string, primary: boolean, onClick: () => void) {
        const gfx = this.add.graphics();
        const drawBtn = (hovered: boolean) => {
            gfx.clear();
            drawChamferPanel(gfx, x, y, w, h, {
                cut: 14,
                fillColor: primary ? (hovered ? 0x0284c7 : 0x0369a1) : (hovered ? 0x1e293b : 0x0f172a),
                fillAlpha: 0.96,
                strokeColor: primary ? (hovered ? 0xe0f2fe : 0x7dd3fc) : (hovered ? 0x94a3b8 : 0x475569),
                strokeAlpha: 1,
                lineWidth: primary ? 2.5 : 2,
                brackets: primary,
                bracketLen: 12,
                bracketColor: 0x38bdf8,
            });
        };
        drawBtn(false);
        this.add.text(x, y, label, {
            fontSize: w < 300 ? '22px' : '26px',
            fontFamily: 'future, sans-serif',
            color: primary ? '#ffffff' : '#e2e8f0',
        }).setOrigin(0.5);
        const hit = this.add.rectangle(x, y, w, h, 0x000000, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => drawBtn(true));
        hit.on('pointerout', () => drawBtn(false));
        hit.on('pointerdown', () => {
            if (this._inputReady) onClick();
        });
    }

    update() {
        if (!this._inputReady) return;

        const pad = this._gamepadTracker.poll(this);
        if (!this._scoreSaved) {
            if (pad.confirm) {
                this.saveCurrentScore();
            } else if (pad.pause) {
                this.playAgain();
            } else if (pad.back) {
                this.goHome();
            }
        } else {
            if (pad.confirm || pad.pause) {
                this.playAgain();
            } else if (pad.back) {
                this.goHome();
            }
        }
    }

    private buildScoreEntryUI(cx: number, cy: number, w: number) {
        const panelGfx = this.add.graphics();
        drawChamferPanel(panelGfx, cx, cy, w, 250, {
            cut: 16,
            fillColor: 0x0b1324,
            fillAlpha: 0.94,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.85,
            lineWidth: 2,
            brackets: true,
            bracketLen: 14,
            bracketColor: 0x7dd3fc,
        });

        const title = this.add.text(cx, cy - 88, 'ENREGISTRER VOTRE PSEUDO', {
            fontSize: '21px',
            fontFamily: 'future, sans-serif',
            color: '#7dd3fc',
        }).setOrigin(0.5);

        const clearW = 148;
        const inputW = w - clearW - 64;
        const inputX = cx - clearW / 2 - 8;
        const clearX = cx + inputW / 2 + 12;

        const inputGfx = this.add.graphics();
        drawChamferPanel(inputGfx, inputX, cy - 18, inputW, 64, {
            cut: 10,
            fillColor: 0x13203a,
            fillAlpha: 1,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.9,
            lineWidth: 2,
        });

        this._nameText = this.add.text(inputX, cy - 18, this._playerName, {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#ffffff',
        }).setOrigin(0.5);

        const clearGfx = this.add.graphics();
        const drawClear = (hovered: boolean) => {
            clearGfx.clear();
            drawChamferPanel(clearGfx, clearX, cy - 18, clearW, 64, {
                cut: 10,
                fillColor: hovered ? 0x475569 : 0x1e293b,
                fillAlpha: 0.96,
                strokeColor: hovered ? 0xe2e8f0 : 0x64748b,
                strokeAlpha: 0.9,
                lineWidth: 2,
            });
        };
        drawClear(false);
        const clearLabel = this.add.text(clearX, cy - 18, 'EFFACER', {
            fontSize: '19px',
            fontFamily: 'future, sans-serif',
            color: '#f8fafc',
        }).setOrigin(0.5);
        const clearHit = this.add.rectangle(clearX, cy - 18, clearW, 64, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        clearHit.on('pointerover', () => drawClear(true));
        clearHit.on('pointerout', () => drawClear(false));
        clearHit.on('pointerdown', () => {
            if (!this._inputReady || this._scoreSaved) return;
            this._playerName = '';
            this.refreshNameDisplay();
        });

        const saveW = Math.min(460, w - 48);
        const saveGfx = this.add.graphics();
        const drawSave = (hovered: boolean) => {
            saveGfx.clear();
            drawChamferPanel(saveGfx, cx, cy + 72, saveW, 66, {
                cut: 12,
                fillColor: hovered ? 0x16a34a : 0x15803d,
                fillAlpha: 0.96,
                strokeColor: hovered ? 0xbbf7d0 : 0x4ade80,
                strokeAlpha: 1,
                lineWidth: 2.5,
            });
        };
        drawSave(false);
        const saveLabel = this.add.text(cx, cy + 72, 'ENREGISTRER LE SCORE', {
            fontSize: '22px',
            fontFamily: 'future, sans-serif',
            color: '#f0fdf4',
            stroke: '#052e16',
            strokeThickness: 4,
        }).setOrigin(0.5);
        const saveHit = this.add.rectangle(cx, cy + 72, saveW, 66, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        saveHit.on('pointerover', () => drawSave(true));
        saveHit.on('pointerout', () => drawSave(false));
        saveHit.on('pointerdown', () => {
            if (!this._inputReady || this._scoreSaved) return;
            this.saveCurrentScore();
        });

        this._entryGroup.add([
            panelGfx,
            title,
            inputGfx,
            this._nameText,
            clearGfx,
            clearLabel,
            clearHit,
            saveGfx,
            saveLabel,
            saveHit,
        ]);
        this.refreshNameDisplay();
    }

    private refreshNameDisplay() {
        if (!this._nameText || this._scoreSaved) return;
        const suffix = this._cursorVisible && this._playerName.length < 12 ? '_' : '';
        this._nameText.setText(this._playerName + suffix);
    }

    private saveCurrentScore() {
        if (this._scoreSaved) return;
        this._scoreSaved = true;

        const cleanName = this._playerName.trim().slice(0, 12) || 'PILOTE';
        this.saveManager?.setData(SaveConstants.Keys.LAST_PLAYER_NAME, cleanName, false);

        const existing = (this.saveManager?.getData(SaveConstants.Keys.LEADERBOARD) as LeaderboardEntry[] | undefined) ?? [];
        const newEntry: LeaderboardEntry = {
            name: cleanName,
            score: this._score,
            level: this._level,
            date: new Date().toISOString().slice(0, 10),
        };

        const updated = [...existing, newEntry]
            .sort((a, b) => b.score - a.score || b.level - a.level)
            .slice(0, 6);

        this._savedIndex = updated.indexOf(newEntry);
        this.saveManager?.setData(SaveConstants.Keys.LEADERBOARD, updated, true);

        this._entryGroup.removeAll(true);

        const confirmGfx = this.add.graphics();
        drawChamferPanel(confirmGfx, this._entryX, this._entryY, this._entryW - 20, 110, {
            cut: 14,
            fillColor: 0x064e3b,
            fillAlpha: 0.9,
            strokeColor: 0x4ade80,
            strokeAlpha: 1,
            lineWidth: 2,
        });
        const confirmed = this.add.text(
            this._entryX,
            this._entryY,
            this._savedIndex >= 0
                ? `★ SCORE ENREGISTRÉ (#${this._savedIndex + 1})`
                : 'SCORE ENREGISTRÉ !',
            {
                fontSize: '24px',
                fontFamily: 'future, sans-serif',
                color: '#86efac',
                align: 'center',
            }
        ).setOrigin(0.5);
        this._entryGroup.add([confirmGfx, confirmed]);

        this.renderLeaderboard();
        this._actionPromptText.setText('[ESPACE / A] Rejouer  •  [ESC / B] Menu');
    }

    private renderLeaderboard() {
        this._leaderboardGroup.removeAll(true);

        const cx = this._lbCenterX;
        const cy = this._lbCenterY;
        const panelW = this._lbWidth;
        const panelH = this._lbHeight;

        const panelGfx = this.add.graphics();
        drawChamferPanel(panelGfx, cx, cy, panelW, panelH, {
            cut: 16,
            fillColor: 0x0b1324,
            fillAlpha: 0.92,
            strokeColor: 0x334155,
            strokeAlpha: 0.95,
            lineWidth: 2,
            brackets: true,
            bracketLen: 16,
            bracketColor: 0xfacc15,
        });

        const header = this.add.text(cx, cy - panelH / 2 + 42, `MEILLEURS SCORES  •  TOP ${this._lbMaxRows}`, {
            fontSize: '23px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
        }).setOrigin(0.5);

        this._leaderboardGroup.add([panelGfx, header]);

        const entries = (this.saveManager?.getData(SaveConstants.Keys.LEADERBOARD) as LeaderboardEntry[] | undefined) ?? [];
        if (entries.length === 0) {
            const empty = this.add.text(cx, cy + 10, 'Aucun score enregistré pour le moment.', {
                fontSize: '21px',
                color: '#94a3b8',
            }).setOrigin(0.5);
            this._leaderboardGroup.add(empty);
            return;
        }

        const rowStep = this._lbMaxRows <= 3 ? 62 : 66;
        renderLeaderboardRows(
            this,
            this._leaderboardGroup,
            cx,
            cy - panelH / 2 + 108,
            panelW - 48,
            rowStep,
            entries,
            this._lbMaxRows,
            this._savedIndex
        );
    }

    private playAgain() {
        this.scene.launch(GameConstants.SceneKeys.MAIN_UI);
        this.scene.start(GameConstants.SceneKeys.MAIN_GAME);
    }

    private goHome() {
        this.scene.start(GameConstants.SceneKeys.HOME);
    }
}
