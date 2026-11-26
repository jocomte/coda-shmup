import { GameObjects, Input } from "phaser";
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

        this.add.tileSprite(0, 0, width, height, 'bg')
            .setOrigin(0, 0)
            .setTileScale(2)
            .setAlpha(0.65);

        this.add.circle(cx, 240, 380, 0x991b1b, 0.18);

        // Header
        this.add.text(cx, 118, 'RAPPORT DE MISSION', {
            fontSize: '20px',
            fontFamily: 'future, sans-serif',
            color: '#fda4af',
        }).setOrigin(0.5);

        this.add.text(cx, 184, 'GAME OVER', {
            fontSize: '82px',
            fontFamily: 'future, sans-serif',
            color: '#f43f5e',
            stroke: '#020617',
            strokeThickness: 8,
            shadow: { offsetX: 0, offsetY: 0, color: '#f43f5e', blur: 18, fill: true },
        }).setOrigin(0.5);

        // Dual Telemetry Summary Cards
        const statGfx = this.add.graphics();
        drawChamferPanel(statGfx, cx - 220, 304, 410, 104, {
            cut: 14,
            fillColor: 0x0b1324,
            fillAlpha: 0.92,
            strokeColor: 0xfacc15,
            strokeAlpha: 0.85,
            lineWidth: 2,
        });
        this.add.text(cx - 220, 276, 'SCORE FINAL', {
            fontSize: '17px',
            fontFamily: 'future, sans-serif',
            color: '#94a3b8',
        }).setOrigin(0.5);
        this.add.text(cx - 220, 318, `${this._score.toLocaleString('fr-FR')} PTS`, {
            fontSize: '34px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
        }).setOrigin(0.5);

        drawChamferPanel(statGfx, cx + 220, 304, 410, 104, {
            cut: 14,
            fillColor: 0x0b1324,
            fillAlpha: 0.92,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.85,
            lineWidth: 2,
        });
        this.add.text(cx + 220, 276, 'NIVEAU ATTEINT', {
            fontSize: '17px',
            fontFamily: 'future, sans-serif',
            color: '#94a3b8',
        }).setOrigin(0.5);
        this.add.text(cx + 220, 318, `NIVEAU ${this._level}`, {
            fontSize: '34px',
            fontFamily: 'future, sans-serif',
            color: '#38bdf8',
        }).setOrigin(0.5);

        if (isBestRecord) {
            const recGfx = this.add.graphics();
            drawChamferPanel(recGfx, cx, 382, 320, 38, {
                cut: 8,
                fillColor: 0x713f12,
                fillAlpha: 0.9,
                strokeColor: 0xfacc15,
                strokeAlpha: 1,
                lineWidth: 2,
            });
            this.add.text(cx, 382, '★ NOUVEAU RECORD !', {
                fontSize: '18px',
                fontFamily: 'future, sans-serif',
                color: '#fef08a',
            }).setOrigin(0.5);
        }

        // Score Entry section
        this._entryGroup = this.add.container(0, 0);
        this.buildScoreEntryUI(cx);

        // Leaderboard container
        this._leaderboardGroup = this.add.container(0, 0);
        this.renderLeaderboard(cx, 1185);

        // Replay / Home chamfered CTA buttons
        const replayCx = cx - 220;
        const btnY = height - 210;
        const replayGfx = this.add.graphics();
        const drawReplay = (hovered: boolean) => {
            replayGfx.clear();
            drawChamferPanel(replayGfx, replayCx, btnY, 400, 90, {
                cut: 16,
                fillColor: hovered ? 0x0284c7 : 0x0369a1,
                fillAlpha: 0.96,
                strokeColor: hovered ? 0xe0f2fe : 0x7dd3fc,
                strokeAlpha: 1,
                lineWidth: 3,
                brackets: true,
                bracketLen: 14,
                bracketColor: 0x38bdf8,
            });
        };
        drawReplay(false);
        this.add.text(replayCx, btnY, 'REJOUER', {
            fontSize: '30px',
            fontFamily: 'future, sans-serif',
            color: '#ffffff',
        }).setOrigin(0.5);
        const replayHit = this.add.rectangle(replayCx, btnY, 400, 90, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        replayHit.on('pointerover', () => drawReplay(true));
        replayHit.on('pointerout', () => drawReplay(false));
        replayHit.on('pointerdown', () => {
            if (this._inputReady) this.playAgain();
        });

        const homeCx = cx + 220;
        const homeGfx = this.add.graphics();
        const drawHome = (hovered: boolean) => {
            homeGfx.clear();
            drawChamferPanel(homeGfx, homeCx, btnY, 400, 90, {
                cut: 16,
                fillColor: hovered ? 0x1e293b : 0x0f172a,
                fillAlpha: 0.95,
                strokeColor: hovered ? 0x94a3b8 : 0x475569,
                strokeAlpha: 0.95,
                lineWidth: 2,
            });
        };
        drawHome(false);
        this.add.text(homeCx, btnY, 'MENU PRINCIPAL', {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
        }).setOrigin(0.5);
        const homeHit = this.add.rectangle(homeCx, btnY, 400, 90, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        homeHit.on('pointerover', () => drawHome(true));
        homeHit.on('pointerout', () => drawHome(false));
        homeHit.on('pointerdown', () => {
            if (this._inputReady) this.goHome();
        });

        this._actionPromptText = this.add.text(
            cx,
            height - 108,
            'Tapez votre pseudo puis [ENTRÉE] ou cliquez ENREGISTRER',
            {
                fontSize: '22px',
                color: '#cbd5e1',
                align: 'center',
            }
        ).setOrigin(0.5);

        // Blinking cursor for name input
        this.time.addEvent({
            delay: 450,
            loop: true,
            callback: () => {
                this._cursorVisible = !this._cursorVisible;
                this.refreshNameDisplay();
            },
        });

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

    private buildScoreEntryUI(cx: number) {
        const panelGfx = this.add.graphics();
        drawChamferPanel(panelGfx, cx, 592, 880, 330, {
            cut: 18,
            fillColor: 0x0b1324,
            fillAlpha: 0.94,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.85,
            lineWidth: 2,
            brackets: true,
            bracketLen: 16,
            bracketColor: 0x7dd3fc,
        });

        const title = this.add.text(cx, 470, 'ENREGISTRER VOTRE PSEUDO', {
            fontSize: '26px',
            fontFamily: 'future, sans-serif',
            color: '#7dd3fc',
        }).setOrigin(0.5);

        const inputGfx = this.add.graphics();
        drawChamferPanel(inputGfx, cx - 90, 558, 520, 74, {
            cut: 12,
            fillColor: 0x13203a,
            fillAlpha: 1,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.9,
            lineWidth: 2,
        });

        this._nameText = this.add.text(cx - 90, 558, this._playerName, {
            fontSize: '34px',
            fontFamily: 'future, sans-serif',
            color: '#ffffff',
        }).setOrigin(0.5);

        const clearGfx = this.add.graphics();
        const drawClear = (hovered: boolean) => {
            clearGfx.clear();
            drawChamferPanel(clearGfx, cx + 280, 558, 172, 74, {
                cut: 12,
                fillColor: hovered ? 0x475569 : 0x1e293b,
                fillAlpha: 0.96,
                strokeColor: hovered ? 0xe2e8f0 : 0x64748b,
                strokeAlpha: 0.9,
                lineWidth: 2,
            });
        };
        drawClear(false);
        const clearLabel = this.add.text(cx + 280, 558, 'EFFACER', {
            fontSize: '22px',
            fontFamily: 'future, sans-serif',
            color: '#f8fafc',
        }).setOrigin(0.5);
        const clearHit = this.add.rectangle(cx + 280, 558, 172, 74, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        clearHit.on('pointerover', () => drawClear(true));
        clearHit.on('pointerout', () => drawClear(false));
        clearHit.on('pointerdown', () => {
            if (!this._inputReady || this._scoreSaved) return;
            this._playerName = '';
            this.refreshNameDisplay();
        });

        const saveGfx = this.add.graphics();
        const drawSave = (hovered: boolean) => {
            saveGfx.clear();
            drawChamferPanel(saveGfx, cx, 676, 520, 76, {
                cut: 14,
                fillColor: hovered ? 0x16a34a : 0x15803d,
                fillAlpha: 0.96,
                strokeColor: hovered ? 0xbbf7d0 : 0x4ade80,
                strokeAlpha: 1,
                lineWidth: 3,
            });
        };
        drawSave(false);
        const saveLabel = this.add.text(cx, 676, 'ENREGISTRER LE SCORE', {
            fontSize: '26px',
            fontFamily: 'future, sans-serif',
            color: '#f0fdf4',
            stroke: '#052e16',
            strokeThickness: 4,
        }).setOrigin(0.5);
        const saveHit = this.add.rectangle(cx, 676, 520, 76, 0x000000, 0)
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
        const cx = this.scale.width / 2;

        const confirmGfx = this.add.graphics();
        drawChamferPanel(confirmGfx, cx, 592, 820, 120, {
            cut: 16,
            fillColor: 0x064e3b,
            fillAlpha: 0.9,
            strokeColor: 0x4ade80,
            strokeAlpha: 1,
            lineWidth: 2.5,
        });
        const confirmed = this.add.text(
            cx,
            592,
            this._savedIndex >= 0
                ? `★ SCORE ENREGISTRÉ !  (#${this._savedIndex + 1} AU CLASSEMENT)`
                : 'SCORE ENREGISTRÉ !',
            {
                fontSize: '28px',
                fontFamily: 'future, sans-serif',
                color: '#86efac',
                align: 'center',
            }
        ).setOrigin(0.5);
        this._entryGroup.add([confirmGfx, confirmed]);

        this.renderLeaderboard(cx, 1185);
        this._actionPromptText.setText('Appuyez sur [ESPACE] / [A] pour rejouer ou [ESC] / [B] pour le menu');
    }

    private renderLeaderboard(cx: number, cy: number) {
        this._leaderboardGroup.removeAll(true);

        const panelGfx = this.add.graphics();
        drawChamferPanel(panelGfx, cx, cy, 880, 560, {
            cut: 18,
            fillColor: 0x0b1324,
            fillAlpha: 0.92,
            strokeColor: 0x334155,
            strokeAlpha: 0.95,
            lineWidth: 2,
            brackets: true,
            bracketLen: 18,
            bracketColor: 0xfacc15,
        });

        const header = this.add.text(cx, cy - 230, 'MEILLEURS SCORES  •  TOP 6', {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
        }).setOrigin(0.5);

        this._leaderboardGroup.add([panelGfx, header]);

        const entries = (this.saveManager?.getData(SaveConstants.Keys.LEADERBOARD) as LeaderboardEntry[] | undefined) ?? [];
        if (entries.length === 0) {
            const empty = this.add.text(cx, cy + 10, 'Aucun score enregistré pour le moment.', {
                fontSize: '24px',
                color: '#94a3b8',
            }).setOrigin(0.5);
            this._leaderboardGroup.add(empty);
            return;
        }

        renderLeaderboardRows(this, this._leaderboardGroup, cx, cy - 150, 816, 68, entries, 6, this._savedIndex);
    }

    private playAgain() {
        this.scene.launch(GameConstants.SceneKeys.MAIN_UI);
        this.scene.start(GameConstants.SceneKeys.MAIN_GAME);
    }

    private goHome() {
        this.scene.start(GameConstants.SceneKeys.HOME);
    }
}
