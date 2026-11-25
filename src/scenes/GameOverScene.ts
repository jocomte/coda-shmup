import { GameObjects, Input } from "phaser";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";
import SaveConstants, { type LeaderboardEntry } from "../SaveConstants.ts";
import SaveManager from "../managers/SaveManager.ts";
import { GamepadEdgeTracker } from "../utils/GamepadUtils.ts";

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

        const width = this.scale.width;
        const height = this.scale.height;
        const cx = width / 2;

        this.add.tileSprite(0, 0, width, height, 'bg')
            .setOrigin(0, 0)
            .setTileScale(2)
            .setAlpha(0.65);

        this.add.text(cx, 180, 'GAME OVER', {
            fontSize: '86px',
            fontFamily: 'future, sans-serif',
            color: '#f43f5e',
            stroke: '#000000',
            strokeThickness: 8,
        }).setOrigin(0.5);

        this.add.text(cx, 290, `SCORE : ${this._score}   •   NIVEAU ${this._level}`, {
            fontSize: '36px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);

        // Score Entry section
        this._entryGroup = this.add.container(0, 0);
        this.buildScoreEntryUI(cx);

        // Leaderboard container (populated right away & refreshed on save)
        this._leaderboardGroup = this.add.container(0, 0);
        this.renderLeaderboard(cx, 1140);

        // Replay / Home buttons
        const replayBg = this.add.rectangle(cx - 210, height - 240, 380, 92, 0x0ea5e9, 0.92)
            .setStrokeStyle(3, 0x7dd3fc, 1)
            .setInteractive({ useHandCursor: true });
        this.add.text(cx - 210, height - 240, 'REJOUER', {
            fontSize: '32px',
            fontFamily: 'future, sans-serif',
            color: '#ffffff',
        }).setOrigin(0.5);
        replayBg.on('pointerdown', () => {
            if (this._inputReady) this.playAgain();
        });

        const homeBg = this.add.rectangle(cx + 210, height - 240, 380, 92, 0x1e293b, 0.92)
            .setStrokeStyle(3, 0x64748b, 0.9)
            .setInteractive({ useHandCursor: true });
        this.add.text(cx + 210, height - 240, 'MENU', {
            fontSize: '32px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
        }).setOrigin(0.5);
        homeBg.on('pointerdown', () => {
            if (this._inputReady) this.goHome();
        });

        this._actionPromptText = this.add.text(
            cx,
            height - 125,
            'Tapez votre pseudo puis [ENTRÉE] ou cliquez ENREGISTRER',
            {
                fontSize: '24px',
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
        const panel = this.add.rectangle(cx, 540, 860, 340, 0x0f172a, 0.92)
            .setStrokeStyle(3, 0x38bdf8, 0.85);

        const title = this.add.text(cx, 415, 'NOTER VOTRE SCORE', {
            fontSize: '30px',
            fontFamily: 'future, sans-serif',
            color: '#38bdf8',
        }).setOrigin(0.5);

        const inputBox = this.add.rectangle(cx - 80, 505, 520, 76, 0x1e293b, 1)
            .setStrokeStyle(3, 0x64748b, 0.9);

        this._nameText = this.add.text(cx - 80, 505, this._playerName, {
            fontSize: '34px',
            fontFamily: 'future, sans-serif',
            color: '#ffffff',
        }).setOrigin(0.5);

        const clearBg = this.add.rectangle(cx + 280, 505, 160, 76, 0x334155, 0.95)
            .setStrokeStyle(2, 0x94a3b8, 0.8)
            .setInteractive({ useHandCursor: true });
        const clearLabel = this.add.text(cx + 280, 505, 'EFFACER', {
            fontSize: '24px',
            fontFamily: 'future, sans-serif',
            color: '#f8fafc',
        }).setOrigin(0.5);
        clearBg.on('pointerdown', () => {
            if (!this._inputReady || this._scoreSaved) return;
            this._playerName = '';
            this.refreshNameDisplay();
        });

        const saveBg = this.add.rectangle(cx, 625, 480, 78, 0x22c55e, 0.92)
            .setStrokeStyle(3, 0x86efac, 1)
            .setInteractive({ useHandCursor: true });
        const saveLabel = this.add.text(cx, 625, 'ENREGISTRER LE SCORE', {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#052e16',
        }).setOrigin(0.5);
        saveBg.on('pointerdown', () => {
            if (!this._inputReady || this._scoreSaved) return;
            this.saveCurrentScore();
        });

        this._entryGroup.add([panel, title, inputBox, this._nameText, clearBg, clearLabel, saveBg, saveLabel]);
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
        const confirmed = this.add.text(
            cx,
            540,
            this._savedIndex >= 0
                ? `SCORE ENREGISTRÉ ! (#${this._savedIndex + 1} AU CLASSEMENT)`
                : 'SCORE ENREGISTRÉ !',
            {
                fontSize: '32px',
                fontFamily: 'future, sans-serif',
                color: '#4ade80',
                align: 'center',
            }
        ).setOrigin(0.5);
        this._entryGroup.add(confirmed);

        this.renderLeaderboard(cx, 1140);
        this._actionPromptText.setText('Appuyez sur [ESPACE] / [A] pour rejouer ou [ESC] / [B] pour le menu');
    }

    private renderLeaderboard(cx: number, cy: number) {
        this._leaderboardGroup.removeAll(true);

        const panel = this.add.rectangle(cx, cy, 860, 520, 0x0f172a, 0.9)
            .setStrokeStyle(3, 0x334155, 0.9);
        const header = this.add.text(cx, cy - 210, 'MEILLEURS SCORES', {
            fontSize: '32px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
        }).setOrigin(0.5);

        this._leaderboardGroup.add([panel, header]);

        const entries = (this.saveManager?.getData(SaveConstants.Keys.LEADERBOARD) as LeaderboardEntry[] | undefined) ?? [];
        if (entries.length === 0) {
            const empty = this.add.text(cx, cy + 10, 'Aucun score enregistré pour le moment.', {
                fontSize: '26px',
                color: '#94a3b8',
            }).setOrigin(0.5);
            this._leaderboardGroup.add(empty);
            return;
        }

        entries.slice(0, 6).forEach((entry, idx) => {
            const rowY = cy - 130 + idx * 66;
            const isNew = idx === this._savedIndex;
            const color = isNew ? '#4ade80' : idx === 0 ? '#fde047' : '#e2e8f0';

            const nameTxt = this.add.text(cx - 370, rowY, `#${idx + 1}  ${entry.name}`, {
                fontSize: '28px',
                fontFamily: 'future, sans-serif',
                color,
            }).setOrigin(0, 0.5);

            const lvlTxt = this.add.text(cx + 110, rowY, `LVL ${entry.level}`, {
                fontSize: '24px',
                fontFamily: 'future, sans-serif',
                color: '#38bdf8',
            }).setOrigin(0.5);

            const scoreTxt = this.add.text(cx + 370, rowY, `${entry.score} PTS`, {
                fontSize: '28px',
                fontFamily: 'future, sans-serif',
                color,
            }).setOrigin(1, 0.5);

            this._leaderboardGroup.add([nameTxt, lvlTxt, scoreTxt]);
        });
    }

    private playAgain() {
        this.scene.launch(GameConstants.SceneKeys.MAIN_UI);
        this.scene.start(GameConstants.SceneKeys.MAIN_GAME);
    }

    private goHome() {
        this.scene.start(GameConstants.SceneKeys.HOME);
    }
}
