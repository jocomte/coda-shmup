import { BlendModes } from 'phaser';
import IComponent from "./IComponent.ts";
import Entity from "../entities/Entity.ts";

export default class Health extends Phaser.Events.EventEmitter implements IComponent {
    public enabled: boolean = true;

    public static readonly CHANGE_EVENT: string = 'change';
    public static readonly DEATH_EVENT: string = 'death';

    private _current: number;
    private _max: number;
    private readonly _entity: Entity;

    public get current(): number {
        return this._current;
    }

    public get max(): number {
        return this._max;
    }

    public constructor(value: number, entity: Entity) {
        super();

        this._current = value;
        this._max = value;
        this._entity = entity;
    }

    public setMax(value: number, resetCurrent: boolean = true): void {
        this._max = Math.max(1, value);
        if (resetCurrent) {
            this._current = this._max;
        } else {
            this._current = Phaser.Math.Clamp(this._current, 0, this._max);
        }
    }

    public increaseMax(amount: number, healSameAmount: boolean = true): void {
        if (amount <= 0) return;
        this._max += amount;
        if (healSameAmount) {
            this._current = Phaser.Math.Clamp(this._current + amount, 0, this._max);
        }
        this.emit(Health.CHANGE_EVENT, this._current, this._max);
    }

    public damage(amount: number, emitEvents: boolean = true): void {
        if (!this.enabled || amount <= 0) return;
        this.adjust(-amount, emitEvents);
    }

    public heal(amount: number, emitEvents: boolean = true): void {
        if (!this.enabled || amount <= 0) return;
        this.adjust(amount, emitEvents);
    }

    private adjust(delta: number, emitEvents: boolean = true): void {
        if (!this.enabled)
            return;

        const prev: number = this._current;
        this._current = Phaser.Math.Clamp(this._current + delta, 0, this._max);

        if (emitEvents && this._current !== prev) {
            this.emit(Health.CHANGE_EVENT, this._current);

            if (this._current <= 0 && prev > 0) {
                this.spawnDeathExplosion();
                this.emit(Health.DEATH_EVENT);
            }
        }
    }

    private spawnDeathExplosion(): void {
        const scene = this._entity.scene;
        const x = this._entity.x;
        const y = this._entity.y;

        // Expanding shockwave ring
        const ring = scene.add.circle(x, y, 22, 0xfbbf24, 0)
            .setStrokeStyle(5, 0xfde047, 0.9)
            .setDepth(18);
        scene.tweens.add({
            targets: ring,
            scale: 2.8,
            alpha: 0,
            duration: 380,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy(),
        });

        // Core flash star
        const core = scene.add.image(x, y, "sprites", "star2")
            .setTint(0xfef08a)
            .setBlendMode(BlendModes.ADD)
            .setDepth(19);
        scene.tweens.add({
            targets: core,
            scale: { from: 1.5, to: 4.5 },
            alpha: { from: 1, to: 0 },
            angle: 90,
            duration: 420,
            ease: 'Quad.easeOut',
            onComplete: () => core.destroy(),
        });

        // Radial spark particles
        const sparkCount = 8;
        const colors = [0xfde047, 0xf97316, 0x38bdf8, 0xf43f5e];
        for (let i = 0; i < sparkCount; i++) {
            const angle = (i / sparkCount) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
            const dist = Phaser.Math.Between(55, 125);
            const spark = scene.add.image(x, y, "sprites", "glowSpark")
                .setTint(colors[i % colors.length])
                .setBlendMode(BlendModes.ADD)
                .setScale(Phaser.Math.FloatBetween(0.7, 1.3))
                .setDepth(18);

            scene.tweens.add({
                targets: spark,
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist,
                scale: 0.1,
                alpha: 0,
                duration: Phaser.Math.Between(300, 520),
                ease: 'Cubic.easeOut',
                onComplete: () => spark.destroy(),
            });
        }
    }
}
