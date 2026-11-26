import { GameObjects, Input, Scene, Scenes } from "phaser";
import GameConstants from "../GameConstants.ts";
import Player from "../entities/Player.ts";
import AudioManager from "../managers/AudioManager.ts";
import type { UpgradeDefinition } from "../gameData/UpgradeData.ts";
import { GamepadEdgeTracker } from "../utils/GamepadUtils.ts";
import { drawChamferPanel } from "../utils/UITheme.ts";

type LevelUpData = {
    player: Player;
};

type CardVisual = {
    container: GameObjects.Container;
    frameGfx: GameObjects.Graphics;
    accentHex: number;
    width: number;
    height: number;
};

export default class LevelUpScene extends Scene {
    private _player!: Player;
    private _choices: UpgradeDefinition[] = [];
    private _cards: CardVisual[] = [];
    private _selectedIndex: number = 0;
    private _inputReady: boolean = false;
    private _selectionMade: boolean = false;
    private _audioManager?: AudioManager;
    private readonly _gamepadTracker = new GamepadEdgeTracker();

    constructor() {
        super(GameConstants.SceneKeys.LEVEL_UP);
    }

    create(data: LevelUpData) {
        this._player = data.player;
        this._choices = this._player.getUpgradeChoices(3);
        this._cards = [];
        this._selectedIndex = 0;
        this._inputReady = false;
        this._selectionMade = false;
        this._gamepadTracker.reset(this);

        this._audioManager = this.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager | undefined;
        this._audioManager?.setDucked(true);

        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this._audioManager?.setDucked(false);
        }, this);

        if (this._choices.length === 0) {
            this.finishSelection();
            return;
        }

        const width = this.scale.width;
        const height = this.scale.height;
        const cx = width / 2;

        // Dimmed tactical backdrop + central modal aura
        this.add.rectangle(0, 0, width, height, 0x030712, 0.84).setOrigin(0, 0);
        const modalGfx = this.add.graphics();
        drawChamferPanel(modalGfx, cx, 920, 940, 1480, {
            cut: 24,
            fillColor: 0x070d1b,
            fillAlpha: 0.72,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.45,
            lineWidth: 2,
            brackets: true,
            bracketLen: 26,
            bracketColor: 0x38bdf8,
        });

        // Header badge + Title
        const headerGfx = this.add.graphics();
        drawChamferPanel(headerGfx, cx, 240, 560, 44, {
            cut: 10,
            fillColor: 0x0c4a6e,
            fillAlpha: 0.65,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.85,
            lineWidth: 2,
        });
        this.add.text(cx, 240, `NIVEAU ${this._player.level} ATTEINT`, {
            fontSize: '24px',
            fontFamily: 'future, sans-serif',
            color: '#7dd3fc',
        }).setOrigin(0.5);

        this.add.text(cx, 316, 'AMÉLIORATION SYSTÈME', {
            fontSize: '50px',
            fontFamily: 'future, sans-serif',
            color: '#f8fafc',
            stroke: '#020617',
            strokeThickness: 8,
            shadow: { offsetX: 0, offsetY: 0, color: '#38bdf8', blur: 16, fill: true },
        }).setOrigin(0.5);

        this.add.text(cx, 376, 'Sélectionnez un module pour votre vaisseau', {
            fontSize: '22px',
            color: '#cbd5e1',
        }).setOrigin(0.5);

        // Render 3 interactive upgrade cards
        const cardWidth = 860;
        const cardHeight = 280;
        const startY = 576;
        const spacing = 318;

        this._choices.forEach((choice, index) => {
            const cardY = startY + index * spacing;
            this.createUpgradeCard(cx, cardY, cardWidth, cardHeight, choice, index);
        });

        this.refreshCardHighlight();

        this.add.text(cx, 1554, 'Cliquer  •  Touches [1] [2] [3]  •  ↑↓ + Entrée  •  Manette [A]', {
            fontSize: '22px',
            color: '#94a3b8',
            align: 'center',
        }).setOrigin(0.5);

        // Small delay so held movement/action keys don't immediately pick an upgrade
        this.time.delayedCall(350, () => {
            this._gamepadTracker.reset(this);
            this._inputReady = true;
        });

        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            if (!this._inputReady || this._selectionMade || event.repeat) return;

            if (event.keyCode === Input.Keyboard.KeyCodes.ONE && this._choices[0]) {
                this.selectUpgrade(this._choices[0]);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.TWO && this._choices[1]) {
                this.selectUpgrade(this._choices[1]);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.THREE && this._choices[2]) {
                this.selectUpgrade(this._choices[2]);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.UP || event.keyCode === Input.Keyboard.KeyCodes.W || event.keyCode === Input.Keyboard.KeyCodes.Z) {
                this.moveSelection(-1);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.DOWN || event.keyCode === Input.Keyboard.KeyCodes.S) {
                this.moveSelection(1);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.ENTER || event.keyCode === Input.Keyboard.KeyCodes.SPACE) {
                if (this._choices[this._selectedIndex]) {
                    this.selectUpgrade(this._choices[this._selectedIndex]);
                }
            }
        });

        this.scene.bringToTop();
    }

    update() {
        if (!this._inputReady || this._selectionMade) return;

        const pad = this._gamepadTracker.poll(this);
        if (pad.up) this.moveSelection(-1);
        if (pad.down) this.moveSelection(1);
        if (pad.confirm && this._choices[this._selectedIndex]) {
            this.selectUpgrade(this._choices[this._selectedIndex]);
        }
    }

    private moveSelection(delta: number) {
        if (this._choices.length === 0) return;
        this._selectedIndex = (this._selectedIndex + delta + this._choices.length) % this._choices.length;
        this.refreshCardHighlight();
    }

    private refreshCardHighlight() {
        this._cards.forEach((card, idx) => {
            const isSelected = idx === this._selectedIndex;
            card.frameGfx.clear();
            drawChamferPanel(card.frameGfx, 0, 0, card.width, card.height, {
                cut: 18,
                fillColor: isSelected ? 0x162440 : 0x0b1324,
                fillAlpha: 0.96,
                strokeColor: card.accentHex,
                strokeAlpha: isSelected ? 1 : 0.55,
                lineWidth: isSelected ? 4 : 2,
                brackets: isSelected,
                bracketLen: 18,
                bracketColor: card.accentHex,
            });
            card.container.setScale(isSelected ? 1.025 : 1);
        });
    }

    private createUpgradeCard(
        cx: number,
        cy: number,
        w: number,
        h: number,
        choice: UpgradeDefinition,
        index: number
    ) {
        const container = this.add.container(cx, cy + 16).setAlpha(0);
        const accentHex = Number(choice.accentColor.replace('#', '0x'));

        const frameGfx = this.add.graphics();
        const hit = this.add.rectangle(0, 0, w, h, 0x000000, 0)
            .setInteractive({ useHandCursor: true });

        // Left vertical accent bar
        const accentBar = this.add.rectangle(-w / 2 + 12, 0, 8, h - 56, accentHex, 0.95);

        // Glowing icon socket
        const iconX = -w / 2 + 128;
        const iconSocket = this.add.graphics();
        drawChamferPanel(iconSocket, iconX, 0, 152, 152, {
            cut: 16,
            fillColor: 0x13203a,
            fillAlpha: 1,
            strokeColor: accentHex,
            strokeAlpha: 0.8,
            lineWidth: 2,
        });
        const iconHalo = this.add.circle(iconX, 0, 56, accentHex, 0.16);
        const icon = this.add.image(iconX, 0, 'sprites', choice.iconFrame)
            .setScale(1.85);

        // Keycap badge
        const keyBadge = this.add.rectangle(-w / 2 + 252, -74, 44, 34, accentHex, 0.18)
            .setStrokeStyle(1.5, accentHex, 0.85);
        const keyTxt = this.add.text(-w / 2 + 252, -74, `${index + 1}`, {
            fontSize: '20px',
            fontFamily: 'future, sans-serif',
            color: choice.accentColor,
        }).setOrigin(0.5);

        const titleText = this.add.text(-w / 2 + 286, -74, choice.title, {
            fontSize: '32px',
            fontFamily: 'future, sans-serif',
            color: choice.accentColor,
        }).setOrigin(0, 0.5);

        const currentRank = this._player.getUpgradeRank(choice.id);
        const rankLabel = choice.maxRank > 0
            ? (currentRank === 0 ? 'NOUVEAU' : `RANG ${currentRank} → ${currentRank + 1}`)
            : 'BONUS IMMÉDIAT';

        const rankText = this.add.text(w / 2 - 36, -74, rankLabel, {
            fontSize: '20px',
            fontFamily: 'future, sans-serif',
            color: currentRank === 0 && choice.maxRank > 0 ? '#fde047' : '#cbd5e1',
        }).setOrigin(1, 0.5);

        // Visual Rank Pips when maxRank > 0
        const pipNodes: GameObjects.GameObject[] = [];
        if (choice.maxRank > 0) {
            const pipSpacing = 22;
            const totalW = (choice.maxRank - 1) * pipSpacing;
            const startPipX = w / 2 - 42 - totalW;
            for (let r = 0; r < choice.maxRank; r++) {
                const px = startPipX + r * pipSpacing;
                const py = -36;
                const filled = r < currentRank;
                const isNext = r === currentRank;
                const pip = this.add.circle(
                    px,
                    py,
                    isNext ? 7 : 6,
                    filled || isNext ? accentHex : 0x1e293b,
                    filled ? 1 : isNext ? 0.45 : 0.9
                ).setStrokeStyle(2, filled || isNext ? accentHex : 0x475569, 0.95);
                pipNodes.push(pip);
            }
        }

        const descText = this.add.text(-w / 2 + 230, 26, choice.description, {
            fontSize: '26px',
            color: '#f8fafc',
            lineSpacing: 10,
            wordWrap: { width: w - 270 },
        }).setOrigin(0, 0.5);

        container.add([
            frameGfx,
            accentBar,
            iconSocket,
            iconHalo,
            icon,
            keyBadge,
            keyTxt,
            titleText,
            rankText,
            ...pipNodes,
            descText,
            hit,
        ]);
        this._cards.push({ container, frameGfx, accentHex, width: w, height: h });

        this.tweens.add({
            targets: container,
            y: cy,
            alpha: 1,
            duration: 190,
            delay: index * 45,
            ease: 'Cubic.easeOut',
        });

        hit.on('pointerover', () => {
            this._selectedIndex = index;
            this.refreshCardHighlight();
        });

        hit.on('pointerdown', () => {
            if (!this._inputReady || this._selectionMade) return;
            this.selectUpgrade(choice);
        });
    }

    private selectUpgrade(choice: UpgradeDefinition) {
        if (this._selectionMade) return;
        this._selectionMade = true;
        this._player.consumePendingLevelUp();
        this._player.applyUpgrade(choice.id);
        this.finishSelection();
    }

    private finishSelection() {
        if (this._player.hasPendingLevelUps()) {
            this.scene.restart({ player: this._player });
        } else {
            this.scene.resume(GameConstants.SceneKeys.MAIN_GAME);
            this.scene.stop();
        }
    }
}
