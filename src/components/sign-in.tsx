import { component$ } from "@builder.io/qwik"
import { Form, Link } from "@builder.io/qwik-city"
import { useSignIn } from "~/routes/plugin@auth"

export default component$(() => {
    const signInSig = useSignIn()

    return (
        <>
            <button onClick$={() => signInSig.submit({ redirectTo: "/" })}>
                Sign In
            </button>
        </>
    )
})