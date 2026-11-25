import {Physics} from 'phaser';
import {BulletData} from "../gameData/BulletData.ts";
import Bullet from "../entities/Bullet.ts";
import Entity from "../entities/Entity.ts";
import IComponent from "./IComponent.ts";

export default class Weapon implements IComponent {
    public enabled: boolean = true;

    private readonly _bullets: Physics.Arcade.Group;
    private _bulletData: BulletData;

    constructor(bullets: Physics.Arcade.Group, bulletData: BulletData) {
        if (!bullets) {
            console.error("Weapon 'bullets' group cannot be null or undefined");
        }

        this._bullets = bullets;
        this._bulletData = bulletData;
    }

    public setBulletData(bulletData: BulletData) {
        this._bulletData = bulletData;
    }

    public shoot(source: Entity, count: number = 1, spreadAngleDeg: number = 0) {
        if (!this.enabled || !this._bullets || count <= 0)
            return;

        if (count === 1 || spreadAngleDeg <= 0) {
            this.spawnBullet(source, source.rotation);
            return;
        }

        const spreadRad: number = Phaser.Math.DegToRad(spreadAngleDeg);
        const isFullCircle: boolean = spreadAngleDeg >= 360;
        const step: number = isFullCircle ? spreadRad / count : spreadRad / (count - 1);
        const startOffset: number = isFullCircle ? 0 : -spreadRad / 2;

        for (let i = 0; i < count; i++) {
            this.spawnBullet(source, source.rotation + startOffset + step * i);
        }
    }

    private spawnBullet(source: Entity, angle: number) {
        const bullet: Bullet = this._bullets.get() as Bullet;
        if (!bullet)
            return;

        const dirX: number = Math.cos(angle);
        const dirY: number = Math.sin(angle);
        const spawnOffset: number = source.arcadeBody.radius;

        bullet.enable(
            source.x + dirX * spawnOffset,
            source.y + dirY * spawnOffset,
            dirX * this._bulletData.speed,
            dirY * this._bulletData.speed,
            this._bulletData
        );
    }
}