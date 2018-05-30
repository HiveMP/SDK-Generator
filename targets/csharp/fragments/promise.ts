export function getPromiseClass(defines: string[]) {
  return `
//------------------------
// <auto-generated>
//     Generated with HiveMP SDK Generator
// </auto-generated>
//------------------------

${defines}

#if UNITY_5 || UNITY_5_3_OR_NEWER
#define IS_UNITY
#endif

using System;
using System.Collections;
using System.Collections.Generic;
using System.Threading;
#if IS_UNITY
using UnityEngine;
#endif

namespace HiveMP.Api
{
    /// <summary>
    /// Configures the scheduler for HiveMP promises.
    /// </summary>
    public class HiveMPPromiseSchedulerSettings
    {
#if !IS_UNITY
        public static Func<object> CoroutineWaitObjectFactory = null;
        public static Func<IEnumerator> ScheduleCoroutine = null;
#endif
    }

    /// <summary>
    /// Much like a ES6 Promise, this class provides a way of asynchronously
    /// notifying the caller that a HiveMP operation has finished.
    /// </summary>
    /// <typeparam name="T"></typeparam>
    public class HiveMPPromise<T>
    {
        private readonly Action<T> _resolve;
        private readonly Action<HiveMPException> _reject;
        private bool _hasT;
        private T _t;
        private HiveMPException _ex;

        public HiveMPPromise(Func<T> task, Action<T> resolve, Action<HiveMPException> reject)
        {
            _resolve = resolve;
            _reject = reject;

            StartCoroutine(WaitUntilResult());
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    _t = task();
                    _hasT = true;
                }
                catch (HiveMPException ex)
                {
                    _ex = ex;
                }
                catch
                {
                    // Ignore all other exceptions.
                }
            });
        }

#if IS_UNITY
        private static GameObject _hiveCallbackObject;
        private static MonoBehaviour _hiveCallbackBehaviour;
#endif

        private static void StartCoroutine(IEnumerator e)
        {
#if IS_UNITY
            if (_hiveCallbackObject == null)
            {
                _hiveCallbackObject = new GameObject();
                _hiveCallbackBehaviour = _hiveCallbackObject.AddComponent<HiveMPUnityCallbackMonoBehaviour>();
            }

            _hiveCallbackBehaviour.StartCoroutine(e);
#else
            if (HiveMPPromiseSchedulerSettings.ScheduleCoroutine == null)
            {
                throw new System.InvalidOperationException("Attempted to schedule a coroutine for HiveMP, but HiveMPPromiseSchedulerSettings.ScheduleCoroutine was null!");
            }

            HiveMPPromiseSchedulerSettings.ScheduleCoroutine(e);
#endif
        }

        private IEnumerator<object> WaitUntilResult()
        {
            do
            {
#if IS_UNITY
                yield return new WaitForFixedUpdate();
#else
                object o;
                if (HiveMPPromiseSchedulerSettings.CoroutineWaitObjectFactory == null)
                {
                    o = new object();
                }
                else
                {
                    o = HiveMPPromiseSchedulerSettings.CoroutineWaitObjectFactory();
                }
                if (o == null)
                {
                    o = new object();
                }
                yield return o;
#endif
            } while (!_hasT && _ex == null);

            if (_hasT)
            {
                _resolve(_t);
            }
            else
            {
                _reject(_ex);
            }
        }
    }

#if IS_UNITY
    public class HiveMPUnityCallbackMonoBehaviour : MonoBehaviour
    {
        public void Start()
        {
            DontDestroyOnLoad(gameObject);
        }
    }
#endif
}
`;
}