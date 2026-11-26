import { GameObjects, Input, Scene, Scenes } from "phaser";
import GameConstants from "../GameConstants.ts";
import AudioManager from "../managers/AudioManager.ts";
import { GamepadEdgeTracker } from "../utils/GamepadUtils.ts";
import { drawChamferPanel, drawChamferRectTopLeft } from "../utils/UITheme.ts";

type PauseRowVisual = {
    gfx: GameObjects.Graphics;
    chevron: GameObjects.Text;
    cx: number;
    cy: number;
    accentColor: number;
};

export default class PauseScene extends Scene {
    private audioManager?: AudioManager;
    private _selectedIndex: number = 0;
    private _inputReady: boolean = false;
    private readonly _gamepadTracker = new GamepadEdgeTracker();

    private _rows: PauseRowVisual[] = [];
    private _musicBarFill!: GameObjects.Rectangle;
    private _musicThumb!: GameObjects.Arc;
    private _musicBarX: number = 0;
    private _musicValueText!: GameObjects.Text;
    private _sfxBarFill!: GameObjects.Rectangle;
    private _sfxThumb!: GameObjects.Arc;
    private _sfxBarX: number = 0;
    private _sfxValueText!: GameObjects.Text;
    private _muteValueText!: GameObjects.Text;

    private static readonly ITEM_COUNT = 6;
    private static readonly ROW_WIDTH = 740;
    private static readonly ROW_HEIGHT = 100;
    private static readonly SLIDER_WIDTH = 280;

    constructor() {
        super(GameConstants.SceneKeys.PAUSE);
    }

    create() {
        this.audioManager = this.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager | undefined;
        this.audioManager?.setDucked(true);

        this._selectedIndex = 0;
        this._inputReady = false;
        this._rows = [];
        this._gamepadTracker.reset(this);

        const width = this.scale.width;
        const height = this.scale.height;
        const cx = width / 2;
        const cy = height / 2;

        // Dimmed backdrop
        this.add.rectangle(0, 0, width, height, 0x030712, 0.84).setOrigin(0, 0);

        // Chamfered Console Panel
        const panelGfx = this.add.graphics();
        drawChamferPanel(panelGfx, cx, cy, 880, 1140, {
            cut: 24,
            fillColor: 0x0b1324,
            fillAlpha: 0.96,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.92,
            lineWidth: 3,
            brackets: true,
            bracketLen: 24,
            bracketColor: 0x7dd3fc,
        });

        this.add.text(cx, cy - 498, 'SYSTÈME EN VEILLE', {
            fontSize: '18px',
            fontFamily: 'future, sans-serif',
            color: '#7dd3fc',
        }).setOrigin(0.5);

        this.add.text(cx, cy - 442, 'PAUSE', {
            fontSize: '68px',
            fontFamily: 'future, sans-serif',
            color: '#38bdf8',
            stroke: '#020617',
            strokeThickness: 8,
            shadow: { offsetX: 0, offsetY: 0, color: '#0ea5e9', blur: 16, fill: true },
        }).setOrigin(0.5);

        const startY = cy - 292;
        const stepY = 136;

        // 0. Resume
        this.createActionRow(0, cx, startY, 'REPRENDRE LA PARTIE', '#4ade80', 0x4ade80, () => this.resumeGame());

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
        this._musicThumb = musicRow.thumb;
        this._musicBarX = musicRow.barX;
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
        this._sfxThumb = sfxRow.thumb;
        this._sfxBarX = sfxRow.barX;
        this._sfxValueText = sfxRow.valueText;

        // 3. Mute Toggle
        const muteRow = this.createToggleRow(3, cx, startY + stepY * 3, 'AUDIO GLOBAL', () => {
            this.audioManager?.toggleMute();
            this.refreshAudioUI();
        });
        this._muteValueText = muteRow.valueText;

        // 4. Restart
        this.createActionRow(4, cx, startY + stepY * 4, 'RECOMMENCER', '#fbbf24', 0xfbbf24, () => this.restartGame());

        // 5. Quit to Home
        this.createActionRow(5, cx, startY + stepY * 5, 'MENU PRINCIPAL', '#f87171', 0xf87171, () => this.quitToHome());

        this.add.text(cx, cy + 504, '↑↓ Naviguer  •  ←→ Régler Volume  •  Entrée / A Valider  •  ESC / Start Reprendre', {
            fontSize: '19px',
            color: '#94a3b8',
            align: 'center',
            wordWrap: { width: 790 },
        }).setOrigin(0.5);

        this.refreshSelectionHighlight();
        this.refreshAudioUI();

        this.game.events.on(GameConstants.Events.AUDIO_CHANGED_EVENT, this.refreshAudioUI, this);
        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.audioManager?.setDucked(false);
            this.game.events.off(GameConstants.Events.AUDIO_CHANGED_EVENT, this.refreshAudioUI, this);
        }, this);

        this.time.delayedCall(220, () => {
            this._gamepadTracker.reset(this);
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

    private registerRowVisual(index: number, cx: number, cy: number, accentColor: number) {
        const gfx = this.add.graphics();
        const chevron = this.add.text(cx - PauseScene.ROW_WIDTH / 2 + 24, cy, '▸', {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#38bdf8',
        }).setOrigin(0.5);

        this._rows[index] = { gfx, chevron, cx, cy, accentColor };
        return gfx;
    }

    private createActionRow(index: number, cx: number, cy: number, label: string, color: string, accentColor: number, onClick: () => void) {
        this.registerRowVisual(index, cx, cy, accentColor);

        const hit = this.add.rectangle(cx, cy, PauseScene.ROW_WIDTH, PauseScene.ROW_HEIGHT, 0x000000, 0)
            .setInteractive({ useHandCursor: true });

        this.add.text(cx, cy, label, {
            fontSize: '30px',
            fontFamily: 'future, sans-serif',
            color,
        }).setOrigin(0.5);

        hit.on('pointerover', () => {
            this._selectedIndex = index;
            this.refreshSelectionHighlight();
        });
        hit.on('pointerdown', () => {
            if (!this._inputReady) return;
            onClick();
        });
    }

    private createToggleRow(index: number, cx: number, cy: number, label: string, onClick: () => void) {
        this.registerRowVisual(index, cx, cy, 0x38bdf8);

        const hit = this.add.rectangle(cx, cy, PauseScene.ROW_WIDTH, PauseScene.ROW_HEIGHT, 0x000000, 0)
            .setInteractive({ useHandCursor: true });

        this.add.text(cx - PauseScene.ROW_WIDTH / 2 + 54, cy, label, {
            fontSize: '26px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
        }).setOrigin(0, 0.5);

        const valueText = this.add.text(cx + PauseScene.ROW_WIDTH / 2 - 34, cy, 'ACTIF', {
            fontSize: '26px',
            fontFamily: 'future, sans-serif',
            color: '#4ade80',
        }).setOrigin(1, 0.5);

        hit.on('pointerover', () => {
            this._selectedIndex = index;
            this.refreshSelectionHighlight();
        });
        hit.on('pointerdown', () => {
            if (!this._inputReady) return;
            onClick();
        });

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
        this.registerRowVisual(index, cx, cy, fillColor);

        const hit = this.add.rectangle(cx, cy, PauseScene.ROW_WIDTH, PauseScene.ROW_HEIGHT, 0x000000, 0)
            .setInteractive();
        hit.on('pointerover', () => {
            this._selectedIndex = index;
            this.refreshSelectionHighlight();
        });

        this.add.text(cx - PauseScene.ROW_WIDTH / 2 + 54, cy, label, {
            fontSize: '25px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
        }).setOrigin(0, 0.5);

        // Minus pill
        const minusX = cx - 64;
        const minusBg = this.add.rectangle(minusX, cy, 46, 40, 0x0f172a, 0.95)
            .setStrokeStyle(1.5, 0x64748b, 0.9)
            .setInteractive({ useHandCursor: true });
        this.add.text(minusX, cy, '-', {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
        }).setOrigin(0.5);
        minusBg.on('pointerover', () => minusBg.setStrokeStyle(2, fillColor, 1));
        minusBg.on('pointerout', () => minusBg.setStrokeStyle(1.5, 0x64748b, 0.9));
        minusBg.on('pointerdown', () => {
            if (this._inputReady) onStep(-0.1);
        });

        // Chamfered slider bar
        const barX = cx - 22;
        const trackGfx = this.add.graphics();
        drawChamferRectTopLeft(trackGfx, barX, cy - 11, PauseScene.SLIDER_WIDTH, 22, {
            cut: 6,
            fillColor: 0x070e1c,
            fillAlpha: 1,
            strokeColor: 0x475569,
            strokeAlpha: 0.9,
            lineWidth: 1.5,
        });
        const barHit = this.add.rectangle(barX, cy, PauseScene.SLIDER_WIDTH, 32, 0x000000, 0)
            .setOrigin(0, 0.5)
            .setInteractive({ useHandCursor: true });

        const fill = this.add.rectangle(barX + 3, cy, PauseScene.SLIDER_WIDTH - 6, 14, fillColor, 1)
            .setOrigin(0, 0.5);
        const thumb = this.add.circle(barX + PauseScene.SLIDER_WIDTH - 3, cy, 11, 0xf8fafc, 1)
            .setStrokeStyle(3, fillColor, 1);

        barHit.on('pointerdown', (pointer: Input.Pointer) => {
            if (!this._inputReady) return;
            const ratio = Phaser.Math.Clamp((pointer.x - barX) / PauseScene.SLIDER_WIDTH, 0, 1);
            onBarClick(ratio);
        });

        // Plus pill
        const plusX = barX + PauseScene.SLIDER_WIDTH + 34;
        const plusBg = this.add.rectangle(plusX, cy, 46, 40, 0x0f172a, 0.95)
            .setStrokeStyle(1.5, 0x64748b, 0.9)
            .setInteractive({ useHandCursor: true });
        this.add.text(plusX, cy, '+', {
            fontSize: '26px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
        }).setOrigin(0.5);
        plusBg.on('pointerover', () => plusBg.setStrokeStyle(2, fillColor, 1));
        plusBg.on('pointerout', () => plusBg.setStrokeStyle(1.5, 0x64748b, 0.9));
        plusBg.on('pointerdown', () => {
            if (this._inputReady) onStep(0.1);
        });

        const valueText = this.add.text(cx + PauseScene.ROW_WIDTH / 2 - 26, cy, '100%', {
            fontSize: '21px',
            fontFamily: 'future, sans-serif',
            color: '#f8fafc',
        }).setOrigin(1, 0.5);

        return { fill, thumb, barX, valueText };
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
        this._rows.forEach((row, idx) => {
            if (!row) return;
            const isSelected = idx === this._selectedIndex;
            row.gfx.clear();
            drawChamferPanel(row.gfx, row.cx, row.cy, PauseScene.ROW_WIDTH, PauseScene.ROW_HEIGHT, {
                cut: 14,
                fillColor: isSelected ? 0x192844 : 0x111c33,
                fillAlpha: isSelected ? 0.98 : 0.86,
                strokeColor: isSelected ? row.accentColor : 0x334155,
                strokeAlpha: isSelected ? 1 : 0.8,
                lineWidth: isSelected ? 3 : 2,
            });
            row.chevron.setVisible(isSelected);
        });
    }

    private refreshAudioUI() {
        if (!this.audioManager) return;

        const musicVol = this.audioManager.musicVolume;
        const sfxVol = this.audioManager.sfxVolume;
        const musicPct = Math.round(musicVol * 100);
        const sfxPct = Math.round(sfxVol * 100);
        const muted = this.audioManager.muted;

        const fillW = PauseScene.SLIDER_WIDTH - 6;
        this._musicBarFill.width = fillW * musicVol;
        this._musicThumb.x = this._musicBarX + 3 + fillW * musicVol;
        this._musicValueText.setText(`${musicPct}%`);

        this._sfxBarFill.width = fillW * sfxVol;
        this._sfxThumb.x = this._sfxBarX + 3 + fillW * sfxVol;
        this._sfxValueText.setText(`${sfxPct}%`);

        if (muted) {
            this._muteValueText.setText('COUPÉ').setColor('#f87171');
        } else {
            this._muteValueText.setText('ACTIF').setColor('#4ade80');
        }
    }

    private resumeGame() {
        this.scene.resume(GameConstants.SceneKeys.MAIN_GAME);
        this.scene.stop();
    }

    private restartGame() {
        this.scene.stop(GameConstants.SceneKeys.MAIN_UI);
        this.scene.stop(GameConstants.SceneKeys.LEVEL_UP);
        this.scene.launch(GameConstants.SceneKeys.MAIN_UI);
        this.scene.start(GameConstants.SceneKeys.MAIN_GAME);
    }

    private quitToHome() {
        this.scene.stop(GameConstants.SceneKeys.MAIN_UI);
        this.scene.stop(GameConstants.SceneKeys.LEVEL_UP);
        this.scene.stop(GameConstants.SceneKeys.MAIN_GAME);
        this.scene.start(GameConstants.SceneKeys.HOME);
    }
}
