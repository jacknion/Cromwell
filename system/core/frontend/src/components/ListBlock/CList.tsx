import React from 'react'
//@ts-ignore
import styles from './CList.module.scss';
import { TProduct, TPagedList, TPagedMeta, isServer } from '@cromwell/core';
import debounce from 'debounce';
// import Alertify from 'alertify.js';

const getPageId = (pageNum: number) => "infinity-page_" + pageNum;
const getPageNumsAround = (currentPage: number, quantity: number, maxPageNum: number): number[] => {
    const pages: number[] = [];
    const half = Math.floor(quantity / 2);
    const fromStart = currentPage - half < 1 ? true : false;
    const fromEnd = currentPage + half > maxPageNum ? true : false;
    const startIndex = fromStart ? 1 : fromEnd ? (maxPageNum - quantity) : currentPage - half;
    const endIndex = fromStart ? quantity : fromEnd ? maxPageNum : currentPage + half;
    // console.log('fromStart', fromStart, 'fromEnd', fromEnd, 'startIndex', startIndex, 'endIndex', endIndex)
    for (let i = startIndex; i <= endIndex; i++) {
        const num = i;
        if (num <= maxPageNum)
            pages.push(num)
    }
    return pages;
}
const getPagedUrl = (pageNum: number, pathname?: string): string | undefined => {
    if (!isServer()) {
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('pageNumber', pageNum + '');
        return window.location.pathname + '?' + urlParams.toString();
    }
    else {
        return pathname ? pathname + `?pageNumber=${pageNum}` : undefined;
    }

}

type TCssClasses = {
    scrollBox?: string;
    page?: string;
    pagination?: string;
    paginationLink?: string;
    paginationArrowLink?: string;
    paginationActiveLink?: string;
    paginationDisabledLink?: string;
}
type TElements = {
    arrowLeft?: React.ReactNode;
    arrowRight?: React.ReactNode;
    arrowFirst?: React.ReactNode;
    arrowLast?: React.ReactNode;
    pagination?: React.ComponentType<{
        count: number;
        page: number;
        onChange: (page: number) => void;
    }>;
    showMore?: React.ComponentType<{
        onClick: () => void;
    }>
    /** Preloader to show during first data request  */
    preloader?: React.ReactNode;
}

type TProps<DataType, ListItemProps> = {
    /** Component that will display items */
    ListItem: React.ComponentType<TItemComponentProps<DataType, ListItemProps>>;

    /** Prop object to pass for each component in a list */
    listItemProps?: ListItemProps;

    /** Array of data to create components for each piece and virtualize. Won't work with "loader" prop */
    dataList?: DataType[];

    /** Loader function that will be called to load more data during scroll
    * Needed if dataList wasn't provided. Doesn't work with dataLst.
    * If returned data is TPagedList, then will use pagination. If returned data is an array, then it won't be called anymore
    */
    loader?: (pageNum: number) => Promise<TPagedList<DataType> | DataType[] | undefined | null> | undefined | null;

    /** First batch / page. Can be used with "loader". Supposed to be used in SSR to prerender page  */
    firstBatch?: TPagedList<DataType>;

    /** Max pages to render at screen. 10 by default */
    maxDomPages?: number;

    /** Label to show when data array is empty. "No data" by default */
    noDataLabel?: string;

    /** Auto load more pages when scroll reached end of start in minRangeToLoad (px) */
    useAutoLoading?: boolean;

    /** Threshold in px where automatically request next or prev page. 200 by default. Use with useAutoLoading */
    minRangeToLoad?: number;

    /** If useAutoLoading disabled can show button to load next page in the same container */
    useShowMoreButton?: boolean;

    /** When useShowMoreButton and usePagination enabled CList needs to know 
     * container that scrolls pages to define current page during scrolling  */
    scrollContainerSelector?: string;

    /** Display pagination */
    usePagination?: boolean;

    /** Disable caching of loaded pages from "loader" prop when open a new page by pagination. Caching is working by default */
    disableCaching?: boolean;

    /** Max number of page links to display. 10 by default */
    paginationButtonsNum?: number;

    /** Parse and set pageNumber in url as query param */
    useQueryPagination?: boolean;

    /** Force to show preloader instead of a list */
    isLoading?: boolean;

    cssClasses?: TCssClasses;

    elements?: TElements;

    /** window.location.pathname for SSR to prerender pagination links */
    pathname?: string
}

export type TItemComponentProps<DataType, ListItemProps> = {
    data?: DataType;
    listItemProps?: ListItemProps;
}

export class CList<DataType, ListItemProps = {}> extends React.PureComponent<TProps<DataType, ListItemProps>> {

    private dataList: DataType[][] = [];
    private list: {
        elements: JSX.Element[];
        pageNum: number;
    }[] = [];
    private currentPageNum: number = 1;
    private minPageBound: number = 1;
    private maxPageBound: number = 1;
    private canLoadMore: boolean = true;
    private remoteRowCount: number = 0;
    private pageSize?: number;
    private maxPage: number = 1;
    private pageStatuses: ('deffered' | 'loading' | 'fetched' | 'failed')[] = [];
    private isPageLoading: boolean = false;
    private isInitialized: boolean = false;
    private isLoading: boolean = false;
    private scrollBoxRef: React.RefObject<HTMLDivElement> = React.createRef<HTMLDivElement>();
    private wrapperRef: React.RefObject<HTMLDivElement> = React.createRef<HTMLDivElement>();

    constructor(props: TProps<DataType, ListItemProps>) {
        super(props);

        this.getMetaInfo();
    }

    componentDidMount() {

    }

    componentDidUpdate(prevProps: TProps<DataType, ListItemProps>) {

        if (this.props.useAutoLoading && this.scrollBoxRef.current && this.wrapperRef.current) {
            this.wrapperRef.current.style.minHeight = this.scrollBoxRef.current.clientHeight - 20 + 'px';
            const lastPage = this.wrapperRef.current.querySelector(`#${getPageId(this.maxPage)}`);
            if (lastPage) {
                const pad = this.scrollBoxRef.current.clientHeight - lastPage.clientHeight + 10;
                if (pad > 0) {
                    this.wrapperRef.current.style.paddingBottom = pad + 'px';
                }
            }
        };
        this.onScroll();
    }

    private getMetaInfo() {

        if (this.props.dataList) {
            this.parseFirstBatchArray(this.props.dataList);
        }

        if (!this.props.dataList && this.props.loader) {

            if (this.props.useQueryPagination && !isServer()) {
                const urlParams = new URLSearchParams(window.location.search);
                let pageNumber: any = urlParams.get('pageNumber');
                if (pageNumber) {
                    pageNumber = parseInt(pageNumber);
                    if (pageNumber && !isNaN(pageNumber)) {
                        this.currentPageNum = pageNumber;
                        this.minPageBound = pageNumber;
                        this.maxPageBound = pageNumber;
                    }
                }
            }

            if (this.props.firstBatch) {
                // Parse firstBatch
                this.parseFirstBatchPaged(this.props.firstBatch);
            }
            else if (!isServer()) {
                // Load firstBatch
                this.fetchFirstBatch();
            }
        }
    }

    private fetchFirstBatch = async () => {
        if (this.props.loader) {
            this.isLoading = true;

            try {
                const data = await this.props.loader(this.currentPageNum);
                if (data && !Array.isArray(data) && data.elements && data.pagedMeta) {
                    this.parseFirstBatchPaged(data);
                }
                if (data && Array.isArray(data)) {
                    this.parseFirstBatchArray(data);
                }

            } catch (e) {
                console.log(e);
            }
            this.isLoading = false;
            this.forceUpdate();
        }
    }

    private parseFirstBatchPaged = (data: TPagedList<DataType>) => {
        if (data.pagedMeta) {
            this.remoteRowCount = (data.pagedMeta.totalElements) ? data.pagedMeta.totalElements : 0;
            this.pageSize = data.pagedMeta.pageSize;

        }
        if (this.pageSize) {
            this.maxPage = Math.ceil(this.remoteRowCount / this.pageSize);
            for (let i = 1; i <= this.maxPage; i++) {
                this.pageStatuses[i] = 'deffered';
            }
        }
        this.pageStatuses[this.currentPageNum] = 'fetched';

        if (data.elements) {
            this.addElementsToList(data.elements, this.currentPageNum);
            this.forceUpdate();
        }
        this.isInitialized = true;
    }

    private parseFirstBatchArray = (data: DataType[]) => {
        this.canLoadMore = false;
        this.remoteRowCount = data.length;
        this.addElementsToList(data, this.currentPageNum);
        this.isInitialized = true;
        this.forceUpdate();
    }


    private addElementsToList(data: DataType[], pageNum: number) {
        this.dataList[pageNum] = data;
        this.updateList();
    }


    private onScroll = debounce(() => {
        if (this.props.useAutoLoading) {
            const minRangeToLoad = this.props.minRangeToLoad ? this.props.minRangeToLoad : 200;
            if (this.scrollBoxRef.current && this.wrapperRef.current) {
                const scrollTop = this.scrollBoxRef.current.scrollTop;
                const scrollBottom = this.wrapperRef.current.clientHeight - this.scrollBoxRef.current.clientHeight - scrollTop;

                // Rendered last row from data list, but has more pages to load from server
                if (scrollBottom < minRangeToLoad) {
                    if (this.maxPage > this.maxPageBound) {
                        // console.log('onScroll: need to load next page', this.maxPageBound);
                        if (!this.isPageLoading) {
                            this.loadNextPage();
                            return;
                        }
                    }
                }

                // Rendered first element but has more pages to load previously from server
                // console.log('scrollTop', scrollTop, 'scrollBottom', scrollBottom)
                if (this.minPageBound > 1) {
                    if (scrollTop === 0) this.scrollBoxRef.current.scrollTop = 10;
                    if (scrollTop < minRangeToLoad) {
                        // console.log('onScroll: need to load prev page', this.minPageBound);
                        if (!this.isPageLoading) {
                            this.loadPreviousPage();
                        }
                    }
                }
            }
        }
    }, 50)

    public onPageScrolled = (pageNumber: number) => {
        this.currentPageNum = pageNumber;
        if (this.props.useQueryPagination) {
            window.history.pushState({}, '', getPagedUrl(pageNumber));
        }
    }


    public openPage = async (pageNumber: number) => {
        if (this.currentPageNum !== pageNumber) {
            this.onPageScrolled(pageNumber)
            if (this.props.disableCaching) {
                this.dataList = [];
            }

            this.minPageBound = pageNumber;
            this.maxPageBound = pageNumber;
            await this.loadPage(pageNumber);
            this.forceUpdate(() => {
                // if (this.props.useAutoLoading) {
                setTimeout(() => {
                    if (this.wrapperRef.current) {
                        const id = `#${getPageId(pageNumber)}`;
                        const elem = this.wrapperRef.current.querySelector(id);
                        if (elem) elem.scrollIntoView();
                    }
                }, 10)
                // }
            });
        }

    }

    private updateList = () => {
        const ListItem = this.props.ListItem;
        this.list = [];

        if (!this.props.useShowMoreButton) {
            const maxDomPages = this.props.maxDomPages ? this.props.maxDomPages : 10;
            const pageBounds = getPageNumsAround(this.currentPageNum, maxDomPages, this.maxPage);
            // const minPageBound = (this.minPageBound < pageBounds[0]) ? pageBounds[0] : this.minPageBound;
            if (this.minPageBound < pageBounds[0]) this.minPageBound = pageBounds[0];
            // const maxPageBound = (this.maxPageBound > pageBounds[pageBounds.length]) ? pageBounds[pageBounds.length] : this.maxPageBound;
            if (this.maxPageBound > pageBounds[pageBounds.length - 1]) this.maxPageBound = pageBounds[pageBounds.length - 1];

        }

        for (let i = this.minPageBound; i <= this.maxPageBound; i++) {
            const pageData = this.dataList[i];
            if (pageData) {
                const pageItems: JSX.Element[] = [];
                for (let j = 0; j < pageData.length; j++) {
                    const data = pageData[j];
                    pageItems.push(<ListItem data={data} listItemProps={this.props.listItemProps} key={j} />);
                }
                this.list.push({
                    elements: pageItems,
                    pageNum: i
                })
            }
        }
    }

    private async loadData(pageNum: number) {
        if (this.props.loader) {
            // console.log('loadData pageNum:', pageNum);
            this.pageStatuses[pageNum] = 'loading';
            this.isPageLoading = true;
            try {
                const pagedData = await this.props.loader(pageNum);
                if (pagedData && !Array.isArray(pagedData) && pagedData.elements) {
                    this.addElementsToList(pagedData.elements, pageNum);
                    this.pageStatuses[pageNum] = 'fetched';
                    this.isPageLoading = false;
                }
            } catch (e) {
                console.log(e);
                this.pageStatuses[pageNum] = 'failed';
            }
            this.isPageLoading = false;
        }
    }

    private loadPage = async (pageNum: number) => {
        switch (this.pageStatuses[pageNum]) {
            case 'fetched': {
                break;
            }
            case 'loading': {
                break;
            }
            case 'deffered': {
                await this.loadData(pageNum);
                break;
            }
        }
        this.updateList();
    }

    private loadNextPage = async () => {
        this.maxPageBound++;
        const nextNum = this.maxPageBound;
        // console.log('loadNextPage', nextNum, this.pageStatuses[nextNum])
        await this.loadPage(nextNum);
        this.forceUpdate();
    }

    private loadPreviousPage = async () => {
        this.minPageBound--;
        const prevNum = this.minPageBound;
        // console.log('loadPreviousPage', prevNum, this.pageStatuses[prevNum]);
        await this.loadPage(prevNum);
        this.forceUpdate();
    }

    render() {
        if (this.isLoading || this.props.isLoading) {
            return (
                <div className={styles.baseInfiniteLoader}>
                    {this.props.elements?.preloader}
                </div>
            )
        }

        if (this.props.dataList) {
            this.currentPageNum = 1;
            this.minPageBound = 1;
            this.maxPageBound = 1;
            this.maxPage = 1;
            this.dataList = [];
            this.addElementsToList(this.props.dataList, 1);
        }
        // console.log('BaseInfiniteLoader::render', this.minPageBound, this.maxPageBound, this.list)

        if (this.list.length === 0) {
            return (
                <div className={styles.baseInfiniteLoader}>
                    <h3>{this.props.noDataLabel ? this.props.noDataLabel : 'No data'}</h3>
                </div>
            )
        }
        const handleShowMoreClick = () => {
            if (this.maxPage > this.maxPageBound) {
                if (!this.isPageLoading) {
                    this.loadNextPage();
                    this.forceUpdate();
                }
            }
        }

        return (
            <div className={styles.baseInfiniteLoader}>
                <div className={`${styles.scrollBox} ${this.props.cssClasses?.scrollBox || ''}`}
                    ref={this.scrollBoxRef}
                    onScroll={this.onScroll}
                    style={this.props.useAutoLoading ?
                        { height: '100%', overflow: 'auto' } : {}}
                >
                    <div className={styles.wrapper} ref={this.wrapperRef}>
                        {this.list.map(l => (
                            <div className={`${styles.page} ${this.props.cssClasses?.page || ''}`}
                                key={l.pageNum}
                                id={getPageId(l.pageNum)}>
                                {l.elements.map((e, i) => (
                                    e
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
                {this.props.useShowMoreButton && !this.isPageLoading && this.maxPage > this.maxPageBound && (
                    <div className={styles.showMoreBtnContainer}>
                        {this.props.elements?.showMore ? (
                            <this.props.elements.showMore onClick={handleShowMoreClick} />
                        ) : (
                                <div
                                    className={styles.showMoreBtn}
                                    onClick={handleShowMoreClick}
                                >Show more</div>
                            )}

                    </div>
                )}
                {this.props.usePagination && (
                    <Pagination
                        pageNums={this.list.map(p => p.pageNum)}
                        wrapperRef={this.wrapperRef}
                        scrollBoxRef={this.scrollBoxRef}
                        inititalPage={this.currentPageNum}
                        maxPageNum={this.maxPage}
                        openPage={this.openPage}
                        onPageScrolled={this.onPageScrolled}
                        paginationButtonsNum={this.props.paginationButtonsNum}
                        cssClasses={this.props.cssClasses}
                        elements={this.props.elements}
                        pathname={this.props.pathname}
                        scrollContainerSelector={this.props.scrollContainerSelector}
                    />
                )}
            </div>
        );
    }

}


class Pagination extends React.Component<{
    wrapperRef: React.RefObject<HTMLDivElement>;
    scrollBoxRef: React.RefObject<HTMLDivElement>;
    pageNums: number[];
    maxPageNum: number;
    inititalPage: number;
    paginationButtonsNum?: number;
    openPage: (pageNum: number) => void;
    onPageScrolled: (currentPage: number) => void;
    cssClasses?: TCssClasses;
    elements?: TElements;
    pathname?: string;
    scrollContainerSelector?: string;
}> {
    private currentPage: number = this.props.inititalPage;

    componentDidMount() {
        if (this.props.scrollContainerSelector) {
            const container = document.querySelector(this.props.scrollContainerSelector);
            if (container) {
                container.addEventListener('scroll', this.onScroll)
            }
        } else if (this.props.scrollBoxRef.current) {
            this.props.scrollBoxRef.current.addEventListener('scroll', this.onScroll)
        }
    }

    componentDidUpdate() {
        this.onScroll();
    }

    private onScroll = () => {
        // Get current page
        let currPage = 0;
        this.props.pageNums.forEach(p => {
            const id = getPageId(p);
            if (this.props.wrapperRef.current) {
                const pageNode = this.props.wrapperRef.current.querySelector('#' + id);
                if (pageNode) {
                    const bounds = pageNode.getBoundingClientRect();
                    if (!currPage && bounds.bottom > 0) currPage = p;
                }
            }
        });
        if (currPage && this.currentPage !== currPage) {
            // console.log('currPage', currPage)
            this.currentPage = currPage;
            this.props.onPageScrolled(currPage);
            this.forceUpdate();
        }
    }
    render() {

        const currPage = this.currentPage;
        const CustomPagination = this.props.elements?.pagination
        if (CustomPagination) {
            return (
                <CustomPagination
                    page={currPage}
                    count={this.props.maxPageNum}
                    onChange={(pageNum: number) => {
                        this.currentPage = pageNum;
                        this.props.openPage(pageNum);
                    }}
                />
            )
        }

        const paginationDisabledLinkClass = styles.paginationDisabledLink + ' ' + (this.props.cssClasses?.paginationDisabledLink || '')
        const paginationButtonsNum = this.props.paginationButtonsNum ? this.props.paginationButtonsNum : 10;
        const pages = getPageNumsAround(currPage, paginationButtonsNum, this.props.maxPageNum);
        const links: JSX.Element[] = [
            <a href={getPagedUrl(1, this.props.pathname)}
                className={`${styles.pageLink}  ${this.props.cssClasses?.paginationArrowLink || ''} ${currPage === 1 ? paginationDisabledLinkClass : ''}`}
                key={'first'}
                onClick={(e) => {
                    e.preventDefault();
                    this.currentPage = 1;
                    this.props.openPage(1);
                }}>
                {this.props.elements?.arrowFirst ? this.props.elements?.arrowFirst : (
                    <p className={styles.paginationArrow}>⇤</p>
                )}
            </a>,
            <a href={currPage > 1 ? getPagedUrl(currPage - 1, this.props.pathname) : undefined}
                className={`${styles.pageLink}  ${this.props.cssClasses?.paginationArrowLink || ''} ${currPage === 1 ? paginationDisabledLinkClass : ''}`}
                key={'back'}
                onClick={(e) => {
                    e.preventDefault();
                    if (currPage > 1) {
                        this.currentPage = currPage - 1;
                        this.props.openPage(currPage - 1);
                    }
                }}>
                {this.props.elements?.arrowLeft ? this.props.elements?.arrowLeft : (
                    <p className={styles.paginationArrow}>￩</p>
                )}
            </a>,
            ...pages.map(p => (
                <a href={p === currPage ? undefined : getPagedUrl(p, this.props.pathname)}
                    className={`${styles.pageLink} ${p === currPage ? `${styles.activePageLink} ${this.props.cssClasses?.paginationActiveLink || ''}` : ''} ${this.props.cssClasses?.paginationLink || ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        this.currentPage = p;
                        this.props.openPage(p);
                    }}
                    key={p}>{p}</a>
            )),
            <a href={currPage < this.props.maxPageNum ? getPagedUrl(currPage + 1) : undefined}
                className={`${styles.pageLink}  ${this.props.cssClasses?.paginationArrowLink || ''} ${currPage === this.props.maxPageNum ? paginationDisabledLinkClass : ''}`}
                key={'next'}
                onClick={(e) => {
                    e.preventDefault();
                    if (currPage < this.props.maxPageNum) {
                        this.currentPage = currPage + 1;
                        this.props.openPage(currPage + 1);
                    }
                }}>
                {this.props.elements?.arrowRight ? this.props.elements?.arrowRight : (
                    <p className={styles.paginationArrow}>￫</p>
                )}
            </a>,
            <a href={getPagedUrl(this.props.maxPageNum, this.props.pathname)}
                className={`${styles.pageLink}  ${this.props.cssClasses?.paginationArrowLink || ''} ${currPage === this.props.maxPageNum ? paginationDisabledLinkClass : ''}`}
                key={'last'}
                onClick={(e) => {
                    e.preventDefault();
                    this.currentPage = this.props.maxPageNum;
                    this.props.openPage(this.props.maxPageNum);
                }}>
                {this.props.elements?.arrowLast ? this.props.elements?.arrowLast : (
                    <p className={styles.paginationArrow}>⇥</p>
                )}
            </a>
        ]
        return (
            <div className={styles.pagination}>
                <div className={`${styles.paginationContent} ${this.props.cssClasses?.pagination || ''}`}>
                    {...links}
                </div>
            </div>
        )
    }
}