import { TProductReview } from '@cromwell/core';
import { format } from 'date-fns';
import React from 'react';

import { useAdapter } from '../../adapter';
import styles from './ReviewItem.module.scss';

export const ReviewItem = (props: {
  data?: TProductReview;
}) => {
  const data = props.data;
  const { Rating } = useAdapter();
  return (
    <div className={styles.ReviewItem}>
      {data && (
        <>
          <Rating name="read-only" value={data.rating} precision={0.5} readOnly />
          <div className={styles.header}>
            <p className={styles.userName}>{data.userName}</p>
            <p className={styles.createDate}>{data?.createDate ? format(Date.parse(String(data.createDate)), 'd MMMM yyyy') : ''}</p>
          </div>
          <h4 className={styles.title}>{data.title}</h4>
          <p className={styles.description}>{data.description}</p>
        </>
      )}
    </div >
  )
}