import { GameObjects, Input, Scene, Scenes } from "phaser";
import GameConstants from "../GameConstants.ts";
import Player from "../entities/Player.ts";
import AudioManager from "../managers/AudioManager.ts";
import type { UpgradeDefinition } from "../gameData/UpgradeData.ts";
import { GamepadEdgeTracker } from "../utils/GamepadUtils.ts";

type LevelUpData = {
    player: Player;
};

type CardVisual = {
    container: GameObjects.Container;
    bg: GameObjects.Rectangle;
    accentHex: number;
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

        // Dimmed backdrop
        this.add.rectangle(0, 0, width, height, 0x050816, 0.78).setOrigin(0, 0);

        // Title & Subtitle
        this.add.text(width / 2, 240, `NIVEAU ${this._player.level} !`, {
            fontSize: '72px',
            fontFamily: 'future, sans-serif',
            color: '#38bdf8',
            stroke: '#000000',
            strokeThickness: 8,
        }).setOrigin(0.5);

        this.add.text(width / 2, 325, 'CHOISISSEZ UNE AMÉLIORATION DU VAISSEAU', {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);

        // Render 3 interactive upgrade cards
        const cardWidth = 860;
        const cardHeight = 270;
        const startY = 560;
        const spacing = 320;

        this._choices.forEach((choice, index) => {
            const cardY = startY + index * spacing;
            this.createUpgradeCard(width / 2, cardY, cardWidth, cardHeight, choice, index);
        });

        this.refreshCardHighlight();

        this.add.text(width / 2, startY + 3 * spacing - 30, 'Cliquez, appuyez sur [1] [2] [3] ou ↑↓ + Entrée / Manette A', {
            fontSize: '24px',
            color: '#94a3b8',
            align: 'center',
        }).setOrigin(0.5);

        // Small delay so held movement/action keys don't immediately pick an upgrade
        this.time.delayedCall(350, () => {
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
            if (idx === this._selectedIndex) {
                card.bg.setFillStyle(0x1e293b, 1);
                card.bg.setStrokeStyle(5, card.accentHex, 1);
                card.container.setScale(1.03);
            } else {
                card.bg.setFillStyle(0x0f172a, 0.96);
                card.bg.setStrokeStyle(3, card.accentHex, 0.6);
                card.container.setScale(1);
            }
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
        const container = this.add.container(cx, cy);
        const accentHex = Number(choice.accentColor.replace('#', '0x'));

        const bg = this.add.rectangle(0, 0, w, h, 0x0f172a, 0.96)
            .setStrokeStyle(4, accentHex, 0.9)
            .setInteractive({ useHandCursor: true });

        const iconBg = this.add.rectangle(-w / 2 + 125, 0, 148, 148, 0x1e293b, 1)
            .setStrokeStyle(3, accentHex, 0.7);
        const icon = this.add.image(-w / 2 + 125, 0, 'sprites', choice.iconFrame)
            .setScale(1.85);

        const currentRank = this._player.getUpgradeRank(choice.id);
        const rankLabel = choice.maxRank > 0
            ? `RANG ${currentRank} -> ${currentRank + 1}`
            : 'BONUS IMMÉDIAT';

        const titleText = this.add.text(-w / 2 + 230, -68, choice.title, {
            fontSize: '36px',
            fontFamily: 'future, sans-serif',
            color: choice.accentColor,
        }).setOrigin(0, 0.5);

        const rankText = this.add.text(w / 2 - 36, -68, `[${index + 1}]  ${rankLabel}`, {
            fontSize: '24px',
            fontFamily: 'future, sans-serif',
            color: '#cbd5e1',
        }).setOrigin(1, 0.5);

        const descText = this.add.text(-w / 2 + 230, 18, choice.description, {
            fontSize: '28px',
            color: '#f8fafc',
            lineSpacing: 10,
        }).setOrigin(0, 0.5);

        container.add([bg, iconBg, icon, titleText, rankText, descText]);
        this._cards.push({ container, bg, accentHex });

        bg.on('pointerover', () => {
            this._selectedIndex = index;
            this.refreshCardHighlight();
        });

        bg.on('pointerdown', () => {
            if (!this._inputReady || this._selectionMade) return;
            this.selectUpgrade(choice);
        });
    }

    private selectUpgrade(choice: UpgradeDefinition) {
        this._selectionMade = true;
        this._player.applyUpgrade(choice.id);
        this.finishSelection();
    }

    private finishSelection() {
        this.scene.stop();
        if (this._player.hasPendingLevelUps()) {
            this._player.triggerNextLevelUp();
        } else {
            this.scene.resume(GameConstants.SceneKeys.MAIN_GAME);
        }
    }
}
