import { DBTableNames, TProduct, TPagedList } from '@cromwell/core';
import {
    applyGetManyFromOne,
    getPaged,
    PagedParamsInput,
    PagedProduct,
    Product,
    ProductCategoryRepository,
    ProductRepository,
} from '@cromwell/core-backend';
import { Arg, Query, Resolver } from 'type-graphql';
import { Brackets, getCustomRepository, SelectQueryBuilder, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { TProductFilterAttribute, TProductFilter, TFilteredList, TFilterMeta } from '../../types';
import { ProductFilterInput } from '../entities/ProductFilter';
import { FilteredProduct } from '../entities/FilteredProduct';

@Resolver(Product)
export default class ProductFilterResolver {

    @Query(() => FilteredProduct)
    async getFilteredProductsFromCategory(
        @Arg("categoryId") categoryId: string,
        @Arg("pagedParams") pagedParams: PagedParamsInput<TProduct>,
        @Arg("filterParams", { nullable: true }) filterParams: ProductFilterInput
    ): Promise<TFilteredList<TProduct> | undefined> {

        const getQb = (shouldApplyPriceFilter = true): SelectQueryBuilder<Product> => {
            const productRepo = getCustomRepository(ProductRepository);
            const qb = productRepo.createQueryBuilder(DBTableNames.Product);
            applyGetManyFromOne(qb, DBTableNames.Product, 'categories',
                DBTableNames.ProductCategory, categoryId);

            if (filterParams) {
                this.applyProductFilter(qb, filterParams, shouldApplyPriceFilter);
            }
            return qb;
        }
        const getFilterMeta = async (): Promise<TFilterMeta> => {
            // Get max price
            const qb = getQb(false);
            let maxPrice = (await qb.select(`MAX(${DBTableNames.Product}.price)`, "maxPrice").getRawOne()).maxPrice;
            if (maxPrice && typeof maxPrice === 'string') maxPrice = parseInt(maxPrice);

            let minPrice = (await qb.select(`MIN(${DBTableNames.Product}.price)`, "minPrice").getRawOne()).minPrice;
            if (minPrice && typeof minPrice === 'string') minPrice = parseInt(minPrice);

            return {
                minPrice, maxPrice
            }
        }
        const getElements = async (): Promise<TPagedList<TProduct>> => {
            const qb = getQb();
            return await getPaged<TProduct>(qb, DBTableNames.Product, pagedParams);
        }

        const filterMeta = await getFilterMeta();
        const paged = await getElements();

        const filtered: TFilteredList<TProduct> = {
            ...paged,
            filterMeta
        }
        return filtered;
    }

    private applyProductFilter(qb: SelectQueryBuilder<TProduct>, filterParams: TProductFilter, shouldApplyPriceFilter = true) {
        let isFirstAttr = true;

        const qbAddWhere: typeof qb.where = (where, params) => {
            if (isFirstAttr) {
                isFirstAttr = false;
                return qb.where(where, params);
            } else {
                return qb.andWhere(where as any, params);
            }
        }

        if (filterParams.attributes) {
            filterParams.attributes.forEach(attr => {
                if (attr.values.length > 0) {
                    const brackets = new Brackets(subQb => {
                        let isFirstVal = true;
                        attr.values.forEach(val => {
                            const likeStr = `%{"key":"${attr.key}","values":[%{"value":"${val}"}%]}%`;
                            const valKey = `${attr.key}_${val}`;
                            const query = `${DBTableNames.Product}.attributesJSON LIKE :${valKey}`;
                            if (isFirstVal) {
                                isFirstVal = false;
                                subQb.where(query, { [valKey]: likeStr })
                            } else {
                                subQb.orWhere(query, { [valKey]: likeStr })
                            }
                        })
                    });
                    qbAddWhere(brackets);
                }
            });
        }

        if (shouldApplyPriceFilter) {
            if (filterParams.maxPrice) {
                const query = `${DBTableNames.Product}.price <= :maxPrice`;
                qbAddWhere(query, { maxPrice: filterParams.maxPrice })
            }
            if (filterParams.minPrice) {
                const query = `${DBTableNames.Product}.price >= :minPrice`;
                qbAddWhere(query, { minPrice: filterParams.minPrice })
            }
        }

    }
}