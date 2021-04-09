import { TTag } from '@cromwell/core';
import { Field, ObjectType } from 'type-graphql';
import { Column, Entity } from 'typeorm';

import { BasePageEntity } from './BasePageEntity';

@Entity()
@ObjectType()
export class Tag extends BasePageEntity implements TTag {
    @Field(type => String)
    @Column({ type: "varchar", unique: true })
    name: string;

    @Field(type => String, { nullable: true })
    @Column({ type: "varchar", nullable: true })
    color?: string | null;

    @Field(type => String, { nullable: true })
    @Column({ type: "varchar", nullable: true })
    image?: string | null;

    @Field(type => String, { nullable: true })
    @Column({ type: "varchar", nullable: true })
    description?: string | null;

}