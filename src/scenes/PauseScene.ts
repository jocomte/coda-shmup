import { GameObjects, Input, Scene, Scenes } from "phaser";
import GameConstants from "../GameConstants.ts";
import AudioManager from "../managers/AudioManager.ts";
import { GamepadEdgeTracker } from "../utils/GamepadUtils.ts";

export default class PauseScene extends Scene {
    private audioManager?: AudioManager;
    private _selectedIndex: number = 0;
    private _inputReady: boolean = false;
    private readonly _gamepadTracker = new GamepadEdgeTracker();

    private _rowBgs: GameObjects.Rectangle[] = [];
    private _musicBarFill!: GameObjects.Rectangle;
    private _musicValueText!: GameObjects.Text;
    private _sfxBarFill!: GameObjects.Rectangle;
    private _sfxValueText!: GameObjects.Text;
    private _muteValueText!: GameObjects.Text;

    private static readonly ITEM_COUNT = 6;
    private static readonly SLIDER_WIDTH = 300;

    constructor() {
        super(GameConstants.SceneKeys.PAUSE);
    }

    create() {
        this.audioManager = this.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager | undefined;
        this.audioManager?.setDucked(true);

        this._selectedIndex = 0;
        this._inputReady = false;
        this._rowBgs = [];
        this._gamepadTracker.reset(this);

        const width = this.scale.width;
        const height = this.scale.height;

        // Dimmed backdrop
        this.add.rectangle(0, 0, width, height, 0x050816, 0.80).setOrigin(0, 0);

        // Panel card
        const panelW = 860;
        const panelH = 1120;
        this.add.rectangle(width / 2, height / 2, panelW, panelH, 0x0f172a, 0.96)
            .setStrokeStyle(4, 0x38bdf8, 0.9);

        this.add.text(width / 2, height / 2 - 470, 'PAUSE', {
            fontSize: '72px',
            fontFamily: 'future, sans-serif',
            color: '#38bdf8',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5);

        const cx = width / 2;
        const startY = height / 2 - 300;
        const stepY = 140;

        // 0. Resume
        this.createActionRow(0, cx, startY, 'REPRENDRE', '#4ade80', () => this.resumeGame());

        // 1. Music Volume Slider
        const musicRow = this.createSliderRow(
            1,
            cx,
            startY + stepY,
            'MUSIQUE',
            0x38bdf8,
            (delta) => this.adjustMusic(delta),
            (ratio) => this.audioManager?.setMusicVolume(ratio)
        );
        this._musicBarFill = musicRow.fill;
        this._musicValueText = musicRow.valueText;

        // 2. SFX Volume Slider
        const sfxRow = this.createSliderRow(
            2,
            cx,
            startY + stepY * 2,
            'EFFETS (SFX)',
            0xfacc15,
            (delta) => this.adjustSfx(delta),
            (ratio) => this.audioManager?.setSfxVolume(ratio)
        );
        this._sfxBarFill = sfxRow.fill;
        this._sfxValueText = sfxRow.valueText;

        // 3. Mute Toggle
        const muteRow = this.createToggleRow(3, cx, startY + stepY * 3, 'COUPER LE SON', () => {
            this.audioManager?.toggleMute();
            this.refreshAudioUI();
        });
        this._muteValueText = muteRow.valueText;

        // 4. Restart
        this.createActionRow(4, cx, startY + stepY * 4, 'RECOMMENCER', '#fbbf24', () => this.restartGame());

        // 5. Quit to Home
        this.createActionRow(5, cx, startY + stepY * 5, 'MENU PRINCIPAL', '#f87171', () => this.quitToHome());

        this.add.text(cx, height / 2 + 505, 'Clavier / Souris / Manette : ↑↓ Naviguer • ←→ Volume • A/Entrée Valider • ESC/Start Reprendre', {
            fontSize: '20px',
            color: '#94a3b8',
            align: 'center',
            wordWrap: { width: 780 },
        }).setOrigin(0.5);

        this.refreshSelectionHighlight();
        this.refreshAudioUI();

        this.game.events.on(GameConstants.Events.AUDIO_CHANGED_EVENT, this.refreshAudioUI, this);
        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.audioManager?.setDucked(false);
            this.game.events.off(GameConstants.Events.AUDIO_CHANGED_EVENT, this.refreshAudioUI, this);
        }, this);

        this.time.delayedCall(220, () => {
            this._inputReady = true;
        });

        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            if (!this._inputReady || event.repeat) return;

            switch (event.keyCode) {
                case Input.Keyboard.KeyCodes.ESC:
                case Input.Keyboard.KeyCodes.P:
                    this.resumeGame();
                    break;
                case Input.Keyboard.KeyCodes.M:
                    this.audioManager?.toggleMute();
                    this.refreshAudioUI();
                    break;
                case Input.Keyboard.KeyCodes.UP:
                case Input.Keyboard.KeyCodes.W:
                case Input.Keyboard.KeyCodes.Z:
                    this.moveSelection(-1);
                    break;
                case Input.Keyboard.KeyCodes.DOWN:
                case Input.Keyboard.KeyCodes.S:
                    this.moveSelection(1);
                    break;
                case Input.Keyboard.KeyCodes.LEFT:
                case Input.Keyboard.KeyCodes.A:
                case Input.Keyboard.KeyCodes.Q:
                    this.adjustSelected(-0.1);
                    break;
                case Input.Keyboard.KeyCodes.RIGHT:
                case Input.Keyboard.KeyCodes.D:
                    this.adjustSelected(0.1);
                    break;
                case Input.Keyboard.KeyCodes.ENTER:
                case Input.Keyboard.KeyCodes.SPACE:
                    this.activateSelected();
                    break;
            }
        });

        this.scene.bringToTop();
    }

    update() {
        if (!this._inputReady) return;

        const pad = this._gamepadTracker.poll(this);
        if (pad.up) this.moveSelection(-1);
        if (pad.down) this.moveSelection(1);
        if (pad.left) this.adjustSelected(-0.1);
        if (pad.right) this.adjustSelected(0.1);
        if (pad.confirm) this.activateSelected();
        if (pad.back || pad.pause) this.resumeGame();
    }

    private createActionRow(index: number, cx: number, cy: number, label: string, color: string, onClick: () => void) {
        const bg = this.add.rectangle(cx, cy, 720, 100, 0x1e293b, 0.9)
            .setStrokeStyle(3, 0x475569, 0.8)
            .setInteractive({ useHandCursor: true });

        this.add.text(cx, cy, label, {
            fontSize: '34px',
            fontFamily: 'future, sans-serif',
            color,
        }).setOrigin(0.5);

        bg.on('pointerover', () => {
            this._selectedIndex = index;
            this.refreshSelectionHighlight();
        });
        bg.on('pointerdown', () => {
            if (!this._inputReady) return;
            onClick();
        });

        this._rowBgs[index] = bg;
    }

    private createToggleRow(index: number, cx: number, cy: number, label: string, onClick: () => void) {
        const bg = this.add.rectangle(cx, cy, 720, 100, 0x1e293b, 0.9)
            .setStrokeStyle(3, 0x475569, 0.8)
            .setInteractive({ useHandCursor: true });

        this.add.text(cx - 320, cy, label, {
            fontSize: '30px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
        }).setOrigin(0, 0.5);

        const valueText = this.add.text(cx + 310, cy, 'ACTIF', {
            fontSize: '30px',
            fontFamily: 'future, sans-serif',
            color: '#4ade80',
        }).setOrigin(1, 0.5);

        bg.on('pointerover', () => {
            this._selectedIndex = index;
            this.refreshSelectionHighlight();
        });
        bg.on('pointerdown', () => {
            if (!this._inputReady) return;
            onClick();
        });

        this._rowBgs[index] = bg;
        return { valueText };
    }

    private createSliderRow(
        index: number,
        cx: number,
        cy: number,
        label: string,
        fillColor: number,
        onStep: (delta: number) => void,
        onBarClick: (ratio: number) => void
    ) {
        const bg = this.add.rectangle(cx, cy, 720, 100, 0x1e293b, 0.9)
            .setStrokeStyle(3, 0x475569, 0.8)
            .setInteractive();

        bg.on('pointerover', () => {
            this._selectedIndex = index;
            this.refreshSelectionHighlight();
        });

        this.add.text(cx - 320, cy, label, {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
        }).setOrigin(0, 0.5);

        // Minus button
        const minusBtn = this.add.text(cx - 45, cy, '[-]', {
            fontSize: '30px',
            fontFamily: 'future, sans-serif',
            color: '#cbd5e1',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        minusBtn.on('pointerdown', () => {
            if (this._inputReady) onStep(-0.1);
        });

        // Slider bar
        const barX = cx - 5;
        const barBg = this.add.rectangle(barX, cy, PauseScene.SLIDER_WIDTH, 26, 0x0f172a, 1)
            .setOrigin(0, 0.5)
            .setStrokeStyle(2, 0x64748b, 0.9)
            .setInteractive({ useHandCursor: true });

        const fill = this.add.rectangle(barX + 2, cy, PauseScene.SLIDER_WIDTH - 4, 20, fillColor, 1)
            .setOrigin(0, 0.5);

        barBg.on('pointerdown', (pointer: Input.Pointer) => {
            if (!this._inputReady) return;
            const ratio = Phaser.Math.Clamp((pointer.x - barX) / PauseScene.SLIDER_WIDTH, 0, 1);
            onBarClick(ratio);
        });

        // Plus button
        const plusBtn = this.add.text(barX + PauseScene.SLIDER_WIDTH + 32, cy, '[+]', {
            fontSize: '30px',
            fontFamily: 'future, sans-serif',
            color: '#cbd5e1',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        plusBtn.on('pointerdown', () => {
            if (this._inputReady) onStep(0.1);
        });

        const valueText = this.add.text(cx + 340, cy, '100%', {
            fontSize: '22px',
            fontFamily: 'future, sans-serif',
            color: '#f8fafc',
        }).setOrigin(1, 0.5);

        this._rowBgs[index] = bg;
        return { fill, valueText };
    }

    private moveSelection(delta: number) {
        this._selectedIndex = (this._selectedIndex + delta + PauseScene.ITEM_COUNT) % PauseScene.ITEM_COUNT;
        this.refreshSelectionHighlight();
    }

    private adjustSelected(delta: number) {
        if (this._selectedIndex === 1) {
            this.adjustMusic(delta);
        } else if (this._selectedIndex === 2) {
            this.adjustSfx(delta);
        } else if (this._selectedIndex === 3) {
            this.audioManager?.toggleMute();
            this.refreshAudioUI();
        }
    }

    private adjustMusic(delta: number) {
        if (!this.audioManager) return;
        this.audioManager.setMusicVolume(this.audioManager.musicVolume + delta);
        this.refreshAudioUI();
    }

    private adjustSfx(delta: number) {
        if (!this.audioManager) return;
        this.audioManager.setSfxVolume(this.audioManager.sfxVolume + delta);
        this.audioManager.playSfx('sfx_exp', 0.6);
        this.refreshAudioUI();
    }

    private activateSelected() {
        switch (this._selectedIndex) {
            case 0:
                this.resumeGame();
                break;
            case 1:
                this.adjustMusic(0.1);
                break;
            case 2:
                this.adjustSfx(0.1);
                break;
            case 3:
                this.audioManager?.toggleMute();
                this.refreshAudioUI();
                break;
            case 4:
                this.restartGame();
                break;
            case 5:
                this.quitToHome();
                break;
        }
    }

    private refreshSelectionHighlight() {
        this._rowBgs.forEach((bg, idx) => {
            if (!bg) return;
            if (idx === this._selectedIndex) {
                bg.setFillStyle(0x27364d, 1);
                bg.setStrokeStyle(4, 0x38bdf8, 1);
            } else {
                bg.setFillStyle(0x1e293b, 0.9);
                bg.setStrokeStyle(3, 0x475569, 0.8);
            }
        });
    }

    private refreshAudioUI() {
        if (!this.audioManager) return;

        const musicPct = Math.round(this.audioManager.musicVolume * 100);
        const sfxPct = Math.round(this.audioManager.sfxVolume * 100);
        const muted = this.audioManager.muted;

        this._musicBarFill.width = (PauseScene.SLIDER_WIDTH - 4) * this.audioManager.musicVolume;
        this._musicValueText.setText(`${musicPct}%`);

        this._sfxBarFill.width = (PauseScene.SLIDER_WIDTH - 4) * this.audioManager.sfxVolume;
        this._sfxValueText.setText(`${sfxPct}%`);

        if (muted) {
            this._muteValueText.setText('COUPÉ').setColor('#f87171');
        } else {
            this._muteValueText.setText('ACTIF').setColor('#4ade80');
        }
    }

    private resumeGame() {
        this.scene.stop();
        this.scene.resume(GameConstants.SceneKeys.MAIN_GAME);
    }

    private restartGame() {
        this.scene.stop();
        this.scene.stop(GameConstants.SceneKeys.MAIN_UI);
        this.scene.stop(GameConstants.SceneKeys.MAIN_GAME);
        this.scene.launch(GameConstants.SceneKeys.MAIN_UI);
        this.scene.start(GameConstants.SceneKeys.MAIN_GAME);
    }

    private quitToHome() {
        this.scene.stop();
        this.scene.stop(GameConstants.SceneKeys.MAIN_UI);
        this.scene.stop(GameConstants.SceneKeys.MAIN_GAME);
        this.scene.start(GameConstants.SceneKeys.HOME);
    }
}
